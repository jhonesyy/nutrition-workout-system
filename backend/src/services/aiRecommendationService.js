require('dotenv').config();

const Groq = require('groq-sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const pool = require('../config/db');

// ============================================================
// AI CLIENTS
// ============================================================
const groq = process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;
const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;

const GROQ_MODELS = ['qwen/qwen3.8-27b', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b'];
const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];

// ============================================================
// CONSTANTS
// ============================================================
const DEFAULT_TIMEOUT_MS = 25000;
const MAX_FOOD_CANDIDATES = 120;
const MAX_EXERCISE_CANDIDATES = 160;
// FIX: cap how many candidates we send to the AI (keeps Groq under its TPM limit)
const AI_FOOD_SEND_LIMIT = 40;
const AI_EXERCISE_SEND_LIMIT = 40;

// ============================================================
// HELPERS
// ============================================================
function normalizeString(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeArray(value) {
  if (Array.isArray(value)) return value.map((i) => String(i || '').trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(',').map((i) => i.trim()).filter(Boolean);
  return [];
}

// FIX: robust allergen parsing (array | "a,b" | '["a","b"]')
function parseAllergenList(value) {
  let arr = [];
  if (Array.isArray(value)) {
    arr = value;
  } else if (typeof value === 'string') {
    const t = value.trim();
    if (t.startsWith('[')) {
      try { arr = JSON.parse(t); } catch { arr = t.replace(/[\[\]"]/g, '').split(','); }
    } else {
      arr = t.split(',');
    }
  }
  return arr.map((s) => String(s).trim()).filter(Boolean);
}

function clampNumber(value, min, max, fallback = min) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function roundNumber(value, decimals = 1) {
  const f = 10 ** decimals;
  return Math.round(safeNumber(value) * f) / f;
}

function cleanJsonText(text) {
  if (!text) return '';
  let cleaned = String(text).trim();
  cleaned = cleaned.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');
  if (first !== -1 && last > first) cleaned = cleaned.slice(first, last + 1);
  return cleaned;
}

function parseAIJson(text) {
  const cleaned = cleanJsonText(text);
  if (!cleaned) throw new Error('AI returned empty response');
  try { return JSON.parse(cleaned); }
  catch (e) { throw new Error(`AI returned invalid JSON: ${e.message}`); }
}

// FIX: Gemini rejects JSON-Schema fields like additionalProperties. Strip them.
function sanitizeSchemaForGemini(schema) {
  if (Array.isArray(schema)) return schema.map(sanitizeSchemaForGemini);
  if (schema && typeof schema === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(schema)) {
      if (k === 'additionalProperties' || k === '$schema' || k === 'definitions' || k === 'strict') continue;
      out[k] = sanitizeSchemaForGemini(v);
    }
    return out;
  }
  return schema;
}

// ============================================================
// JSON SCHEMAS
// ============================================================
const MEAL_PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['dailySummary', 'meals', 'tips'],
  properties: {
    dailySummary: {
      type: 'object',
      additionalProperties: false,
      required: ['targetCalories', 'actualCalories', 'protein_g', 'carbs_g', 'fat_g'],
      properties: {
        targetCalories: { type: 'number' },
        actualCalories: { type: 'number' },
        protein_g: { type: 'number' },
        carbs_g: { type: 'number' },
        fat_g: { type: 'number' },
      },
    },
    meals: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'time', 'items', 'calories', 'protein_g', 'carbs_g', 'fat_g', 'notes'],
        properties: {
          name: { type: 'string' },
          time: { type: 'string' },
          items: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['foodId', 'portion_g'],
              properties: {
                foodId: { type: 'integer' },
                portion_g: { type: 'number' },
              },
            },
          },
          calories: { type: 'number' },
          protein_g: { type: 'number' },
          carbs_g: { type: 'number' },
          fat_g: { type: 'number' },
          notes: { type: 'string' },
        },
      },
    },
    tips: { type: 'array', items: { type: 'string' } },
  },
};

const WORKOUT_PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['focus', 'daysPerWeek', 'sessionDurationMinutes', 'workouts', 'progressionNotes', 'warmup', 'cooldown'],
  properties: {
    focus: { type: 'string' },
    daysPerWeek: { type: 'integer' },
    sessionDurationMinutes: { type: 'integer' },
    workouts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['day', 'exercises'],
        properties: {
          day: { type: 'string' },
          exercises: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['exerciseId', 'sets', 'reps', 'restSeconds', 'formCues', 'notes'],
              properties: {
                exerciseId: { type: 'integer' },
                sets: { type: 'integer' },
                reps: { type: 'string' },
                restSeconds: { type: 'integer' },
                formCues: { type: 'array', items: { type: 'string' } },
                notes: { type: 'string' },
              },
            },
          },
        },
      },
    },
    progressionNotes: { type: 'string' },
    warmup: { type: 'array', items: { type: 'string' } },
    cooldown: { type: 'array', items: { type: 'string' } },
  },
};

// ============================================================
// AI GENERATION
// ============================================================
async function generateWithAI(prompt, systemPrompt = null, options = {}) {
  const {
    temperature = 0.4,
    maxTokens = 2048,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    responseSchema = null,
    schemaName = 'structured_response',
  } = options;

  const messages = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: prompt });

  // 1. GROQ
  if (groq) {
    for (const model of GROQ_MODELS) {
      let timeout;
      try {
        const controller = new AbortController();
        timeout = setTimeout(() => controller.abort(), timeoutMs);

        const request = { model, messages, temperature, max_tokens: maxTokens };
                if (responseSchema) {
          request.response_format = { type: 'json_object' };
        }

        const completion = await groq.chat.completions.create(request, { signal: controller.signal });
        const text = completion.choices?.[0]?.message?.content?.trim();
        if (text) return { text, provider: 'groq', model };
        throw new Error('Empty Groq response');
      } catch (err) {
        console.warn(`[Groq] ${model} failed:`, err.message);
      } finally {
        if (timeout) clearTimeout(timeout);
      }
    }
  }

  // 2. GEMINI FALLBACK (schema sanitized)
  if (genAI) {
    for (const modelName of GEMINI_MODELS) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          generationConfig: {
            temperature,
            maxOutputTokens: maxTokens,
            ...(responseSchema
              ? {
                  responseMimeType: 'application/json',
                  responseSchema: sanitizeSchemaForGemini(responseSchema), // <-- FIX
                }
              : {}),
          },
        });

        const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;
        const result = await model.generateContent(fullPrompt);
        const text = result.response.text()?.trim();
        if (text) return { text, provider: 'gemini', model: modelName };
        throw new Error('Empty Gemini response');
      } catch (err) {
        console.warn(`[Gemini] ${modelName} failed:`, err.message);
      }
    }
  }

  throw new Error('All AI providers failed (Groq + Gemini)');
}

// ============================================================
// FOOD ALLERGEN HELPERS
// ============================================================
const ALLERGEN_KEYWORDS = {
  milk: ['milk', 'dairy', 'cheese', 'cheddar', 'yogurt', 'yoghurt', 'cream', 'butter', 'whey', 'casein', 'condensed milk', 'evaporated milk'],
  egg: ['egg', 'eggs', 'mayonnaise', 'mayo'],
  fish: ['fish', 'tuna', 'salmon', 'tilapia', 'bangus', 'milkfish', 'sardine', 'sardines', 'anchovy', 'anchovies', 'mackerel'],
  shellfish: ['shrimp', 'prawn', 'crab', 'lobster', 'clam', 'mussel', 'oyster', 'scallop', 'shellfish'],
  // FIX: cover "seafood"/"seafoods" so shrimp/crab/fish are all removed
  seafood: ['shrimp', 'prawn', 'crab', 'lobster', 'clam', 'mussel', 'oyster', 'scallop', 'shellfish', 'fish', 'tuna', 'salmon', 'tilapia', 'bangus', 'milkfish', 'sardine', 'sardines', 'anchovy', 'anchovies', 'mackerel'],
  seafoods: ['shrimp', 'prawn', 'crab', 'lobster', 'clam', 'mussel', 'oyster', 'scallop', 'shellfish', 'fish', 'tuna', 'salmon', 'tilapia', 'bangus', 'milkfish', 'sardine', 'sardines', 'anchovy', 'anchovies', 'mackerel'],
  soy: ['soy', 'soya', 'tofu', 'tempeh', 'edamame', 'soybean'],
  peanut: ['peanut', 'peanuts', 'groundnut'],
  tree_nut: ['almond', 'almonds', 'cashew', 'cashews', 'walnut', 'walnuts', 'pistachio', 'pistachios', 'hazelnut', 'hazelnuts', 'pecan', 'pecans', 'macadamia'],
  wheat: ['wheat', 'flour', 'bread', 'pasta', 'noodle', 'noodles'],
  gluten: ['wheat', 'bread', 'pasta', 'noodle', 'noodles', 'flour', 'barley', 'rye'],
};

function normalizeAllergen(allergen) {
  return normalizeString(allergen).replace(/-/g, '_').replace(/\s+/g, '_');
}

function foodMatchesAllergens(food, allergens) {
  const normalizedAllergens = allergens.map(normalizeAllergen).filter(Boolean);
  if (normalizedAllergens.length === 0) return false;

  // FIX: handle allergen_tags stored as array OR comma-separated string
  let dbTags = [];
  if (Array.isArray(food.allergen_tags)) {
    dbTags = food.allergen_tags.map(normalizeAllergen).filter(Boolean);
  } else if (typeof food.allergen_tags === 'string') {
    dbTags = food.allergen_tags.split(',').map(normalizeAllergen).filter(Boolean);
  }

  const searchableText = [food.name, food.brand, ...dbTags].filter(Boolean).join(' ').toLowerCase();

  for (const allergen of normalizedAllergens) {
    if (dbTags.some((tag) => tag === allergen || tag.includes(allergen) || allergen.includes(tag))) return true;
    const keywords = ALLERGEN_KEYWORDS[allergen] || [];
    for (const keyword of keywords) {
      if (searchableText.includes(keyword.toLowerCase())) return true;
    }
  }
  return false;
}

// ============================================================
// FOOD CANDIDATES
// ============================================================
async function getFoodCandidates(userProfile) {
  const allergens = parseAllergenList(userProfile.allergens); // FIX: robust parse
  console.log('[MealPlan] Parsed user allergens =', allergens);

  const limit = clampNumber(userProfile.foodCandidateLimit, 30, MAX_FOOD_CANDIDATES, MAX_FOOD_CANDIDATES);

  const result = await pool.query(
    `SELECT id, name, brand, serving_size, calories, protein_g, carbs_g, fat_g, fiber_g, allergen_tags, source
     FROM foods
     WHERE is_active = TRUE
     ORDER BY CASE WHEN LOWER(source) = 'philfct' THEN 0 WHEN LOWER(source) = 'seed' THEN 1 ELSE 2 END, id
     LIMIT $1`,
    [limit]
  );

  const safeFoods = result.rows.filter((food) => !foodMatchesAllergens(food, allergens));
  console.log(`[MealPlan] Candidates before=${result.rows.length} after-allergen-filter=${safeFoods.length}`);

  if (safeFoods.length === 0) {
    throw new Error('No safe food candidates available for the selected allergen restrictions');
  }
  return safeFoods;
}

// ============================================================
// EXERCISE CANDIDATES
// ============================================================
function exerciseMatchesEquipment(exercise, availableEquipment) {
  if (!Array.isArray(availableEquipment) || availableEquipment.length === 0) return true;
  const equipment = normalizeString(exercise.equipment);
  if (!equipment || equipment === 'body only' || equipment === 'bodyweight') {
    return availableEquipment.some((item) => {
      const n = normalizeString(item);
      return n === 'bodyweight' || n === 'body only' || n === 'none' || n === 'no equipment';
    });
  }
  return availableEquipment.some((item) => {
    const n = normalizeString(item);
    return equipment.includes(n) || n.includes(equipment);
  });
}

function exerciseMatchesDifficulty(exercise, experienceLevel) {
  if (!experienceLevel) return true;
  const requested = normalizeString(experienceLevel);
  const actual = normalizeString(exercise.difficulty);
  if (!actual) return true;
  if (requested === 'beginner' && actual === 'beginner') return true;
  if (requested === 'intermediate' && (actual === 'beginner' || actual === 'intermediate')) return true;
  if (requested === 'advanced' || requested === 'expert') return true;
  return actual === requested;
}

async function getExerciseCandidates(userProfile) {
  const availableEquipment = normalizeArray(userProfile.availableEquipment);
  const experienceLevel = userProfile.experienceLevel || 'intermediate';
  const limit = clampNumber(userProfile.exerciseCandidateLimit, 40, MAX_EXERCISE_CANDIDATES, MAX_EXERCISE_CANDIDATES);

  const result = await pool.query(
    `SELECT id, name, muscle_group, equipment, difficulty, default_sets, default_reps, rest_seconds, common_errors, form_tips
     FROM exercises
     ORDER BY CASE WHEN difficulty = $1 THEN 0 WHEN difficulty = 'Beginner' THEN 1 ELSE 2 END, id
     LIMIT $2`,
    [experienceLevel === 'advanced' ? 'Advanced' : experienceLevel === 'beginner' ? 'Beginner' : 'Intermediate', limit]
  );

  let candidates = result.rows.filter((e) => exerciseMatchesDifficulty(e, experienceLevel));
  if (availableEquipment.length > 0) {
    const filtered = candidates.filter((e) => exerciseMatchesEquipment(e, availableEquipment));
    if (filtered.length > 0) candidates = filtered;
  }
  if (candidates.length === 0) throw new Error('No suitable exercise candidates available');
  return candidates;
}

// ============================================================
// CANDIDATE SERIALIZATION (lean = fewer tokens for Groq)
// ============================================================
function serializeFoodCandidates(foods) {
  return foods.map((food) => ({
    id: food.id,
    name: food.name,
    calories: safeNumber(food.calories),
    protein_g: safeNumber(food.protein_g),
    carbs_g: safeNumber(food.carbs_g),
    fat_g: safeNumber(food.fat_g),
  }));
}

function serializeExerciseCandidates(exercises) {
  return exercises.map((e) => ({
    id: e.id,
    name: e.name,
    muscleGroup: e.muscle_group,
    equipment: e.equipment,
    difficulty: e.difficulty,
    defaultSets: e.default_sets,
    defaultReps: e.default_reps,
    restSeconds: e.rest_seconds,
  }));
}

// ============================================================
// MEAL NUTRITION CALCULATION
// ============================================================
function calculateFoodNutrition(food, portionGrams) {
  const grams = clampNumber(portionGrams, 1, 1000, 100);
  const m = grams / 100;
  return {
    calories: roundNumber(safeNumber(food.calories) * m),
    protein_g: roundNumber(safeNumber(food.protein_g) * m),
    carbs_g: roundNumber(safeNumber(food.carbs_g) * m),
    fat_g: roundNumber(safeNumber(food.fat_g) * m),
    fiber_g: roundNumber(safeNumber(food.fiber_g) * m),
  };
}

// ============================================================
// VALIDATE MEAL PLAN
// ============================================================
function validateMealPlan(rawPlan, foodCandidates, userProfile) {
  if (!rawPlan || typeof rawPlan !== 'object') throw new Error('AI meal plan is not an object');
  if (!Array.isArray(rawPlan.meals)) throw new Error('AI meal plan has no meals array');

  const foodMap = new Map(foodCandidates.map((f) => [Number(f.id), f]));
  const allergens = parseAllergenList(userProfile.allergens);

  const meals = rawPlan.meals.map((meal, mealIndex) => {
    if (!meal || !Array.isArray(meal.items)) throw new Error(`Meal ${mealIndex + 1} has invalid items`);

    const validatedItems = meal.items.map((item) => {
      const foodId = Number(item.foodId);
      const food = foodMap.get(foodId);
      if (!food) throw new Error(`AI selected food ID ${foodId}, but that food is not an allowed candidate`);
      if (foodMatchesAllergens(food, allergens)) throw new Error(`AI selected allergenic food: ${food.name}`);

      const portionGrams = clampNumber(item.portion_g, 10, 1000, 100);
      const nutrition = calculateFoodNutrition(food, portionGrams);
      return {
        foodId: food.id,
        name: food.name,
        brand: food.brand || null,
        portion_g: portionGrams,
        serving_size: food.serving_size || '100 g',
        calories: nutrition.calories,
        protein_g: nutrition.protein_g,
        carbs_g: nutrition.carbs_g,
        fat_g: nutrition.fat_g,
        fiber_g: nutrition.fiber_g,
        display: `${food.name} — ${portionGrams} g`,
      };
    });

    const calculated = validatedItems.reduce(
      (t, i) => ({
        calories: t.calories + i.calories,
        protein_g: t.protein_g + i.protein_g,
        carbs_g: t.carbs_g + i.carbs_g,
        fat_g: t.fat_g + i.fat_g,
        fiber_g: t.fiber_g + i.fiber_g,
      }),
      { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 }
    );

    return {
      name: meal.name || `Meal ${mealIndex + 1}`,
      time: meal.time || '',
      items: validatedItems.map((i) => i.display),
      foodItems: validatedItems,
      calories: roundNumber(calculated.calories),
      protein_g: roundNumber(calculated.protein_g),
      carbs_g: roundNumber(calculated.carbs_g),
      fat_g: roundNumber(calculated.fat_g),
      fiber_g: roundNumber(calculated.fiber_g),
      notes: typeof meal.notes === 'string' ? meal.notes : '',
    };
  });

  const daily = meals.reduce(
    (t, m) => ({
      calories: t.calories + m.calories,
      protein_g: t.protein_g + m.protein_g,
      carbs_g: t.carbs_g + m.carbs_g,
      fat_g: t.fat_g + m.fat_g,
      fiber_g: t.fiber_g + m.fiber_g,
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 }
  );

  const targetCalories = safeNumber(userProfile.targetCalories || userProfile.tdee || rawPlan.dailySummary?.targetCalories);

  return {
    dailySummary: {
      targetCalories: roundNumber(targetCalories),
      actualCalories: roundNumber(daily.calories),
      protein_g: roundNumber(daily.protein_g),
      carbs_g: roundNumber(daily.carbs_g),
      fat_g: roundNumber(daily.fat_g),
      fiber_g: roundNumber(daily.fiber_g),
    },
    meals,
    tips: Array.isArray(rawPlan.tips) ? rawPlan.tips.filter((t) => typeof t === 'string').slice(0, 10) : [],
    validation: {
      source: 'postgresql',
      foodCandidates: foodCandidates.length,
      aiSelectedOnlyFromCandidates: true,
      nutritionCalculatedFromDatabase: true,
      allergensChecked: true,
    },
  };
}

// ============================================================
// VALIDATE WORKOUT PLAN
// ============================================================
function validateWorkoutPlan(rawPlan, exerciseCandidates, userProfile) {
  if (!rawPlan || typeof rawPlan !== 'object') throw new Error('AI workout plan is not an object');
  if (!Array.isArray(rawPlan.workouts)) throw new Error('AI workout plan has no workouts array');

  const exerciseMap = new Map(exerciseCandidates.map((e) => [Number(e.id), e]));

  const workouts = rawPlan.workouts.map((workout, workoutIndex) => {
    if (!workout || !Array.isArray(workout.exercises)) throw new Error(`Workout ${workoutIndex + 1} has invalid exercises`);

    const exercises = workout.exercises.map((item) => {
      const exerciseId = Number(item.exerciseId);
      const exercise = exerciseMap.get(exerciseId);
      if (!exercise) throw new Error(`AI selected exercise ID ${exerciseId}, but that exercise is not an allowed candidate`);

      const sets = clampNumber(item.sets, 1, 10, exercise.default_sets || 3);
      const restSeconds = clampNumber(item.restSeconds, 15, 600, exercise.rest_seconds || 90);
      const reps = String(item.reps || exercise.default_reps || '8-12').slice(0, 50);
      const formCues = Array.isArray(item.formCues) ? item.formCues.filter((c) => typeof c === 'string').slice(0, 6) : [];
      if (formCues.length === 0 && exercise.form_tips) formCues.push(exercise.form_tips);

      return {
        exerciseId: exercise.id,
        name: exercise.name,
        muscleGroup: exercise.muscle_group,
        equipment: exercise.equipment,
        difficulty: exercise.difficulty,
        sets,
        reps,
        restSeconds,
        formCues,
        notes: typeof item.notes === 'string' ? item.notes : '',
        dbFormTips: exercise.form_tips || null,
        dbCommonErrors: exercise.common_errors || null,
      };
    });

    return { day: workout.day || `Day ${workoutIndex + 1}`, exercises };
  });

  return {
    focus: rawPlan.focus || userProfile.goal || 'General Fitness',
    daysPerWeek: clampNumber(rawPlan.daysPerWeek, 1, 7, userProfile.daysPerWeek || 4),
    sessionDurationMinutes: clampNumber(rawPlan.sessionDurationMinutes, 15, 180, 60),
    workouts,
    progressionNotes: rawPlan.progressionNotes || '',
    warmup: Array.isArray(rawPlan.warmup) ? rawPlan.warmup.filter((i) => typeof i === 'string').slice(0, 10) : [],
    cooldown: Array.isArray(rawPlan.cooldown) ? rawPlan.cooldown.filter((i) => typeof i === 'string').slice(0, 10) : [],
    validation: {
      source: 'postgresql',
      exerciseCandidates: exerciseCandidates.length,
      aiSelectedOnlyFromCandidates: true,
      exerciseIdsValidated: true,
    },
  };
}

// ============================================================
// MEAL PLAN
// ============================================================
async function generateMealPlan(userProfile) {
  const foodCandidates = await getFoodCandidates(userProfile);
  // FIX: cap + lean serialization to stay under Groq TPM
  const serializedFoods = serializeFoodCandidates(foodCandidates).slice(0, AI_FOOD_SEND_LIMIT);

  const systemPrompt = `
You are a practical sports nutritionist working with House of Strength GYM in the Philippines.
Your job is to select foods ONLY from the supplied PostgreSQL candidate list.
CRITICAL DATABASE RULE:
- NEVER invent a food or a food ID.
- Every meal item MUST reference one supplied food ID.
- foodId is the source of truth. Portion is in grams.
- Nutrition values are calculated by the application from PostgreSQL; do not override them.
Nutrition planning:
- Prefer affordable Filipino foods.
- Respect the user's target calories/macros and allergen restrictions.
- Use realistic portions. Create Breakfast, Lunch, Dinner, and 2 Snacks when possible.
- Do not invent medical facts or diagnose disease.
- Return only JSON matching the supplied schema.
`;

  // FIX: compact JSON (no pretty-print) to reduce tokens
  const prompt = `
Create a full-day personalized meal plan.
USER PROFILE:
${JSON.stringify(userProfile)}
ALLOWED FOOD CANDIDATES FROM POSTGRESQL:
${JSON.stringify(serializedFoods)}
STRICT FOOD RULES:
1. Only select food IDs from the ALLOWED FOOD CANDIDATES list.
2. Every item must have foodId and portion_g.
3. Never invent food IDs or use foods outside the list.
4. Use 4-5 eating occasions (Breakfast, Lunch, Dinner, Snack, Snack).
5. Keep portions realistic and respect allergens.
6. Target calories: ${safeNumber(userProfile.targetCalories || userProfile.tdee)}
7. Target protein: ${safeNumber(userProfile.protein_g)} g
8. Target carbs: ${safeNumber(userProfile.carbs_g)} g
9. Target fat: ${safeNumber(userProfile.fat_g)} g
The application calculates nutrition from the database; only select foodId + portion_g.
Return exactly the requested JSON structure.
`;

  const result = await generateWithAI(prompt, systemPrompt, {
    temperature: 0.25,
    maxTokens: 1500, // FIX: lower output budget
    responseSchema: MEAL_PLAN_SCHEMA,
    schemaName: 'nutrition_meal_plan',
  });

  let plan;
  try {
    plan = parseAIJson(result.text);
  } catch (error) {
    return { raw: result.text, meta: { provider: result.provider, model: result.model, parseError: true, error: error.message } };
  }

  const validated = validateMealPlan(plan, foodCandidates, userProfile);
  return {
    ...validated,
    meta: { provider: result.provider, model: result.model, candidateCount: foodCandidates.length, databaseBacked: true },
  };
}

// ============================================================
// WORKOUT PLAN
// ============================================================
async function generateWorkoutPlan(userProfile) {
  const exerciseCandidates = await getExerciseCandidates(userProfile);
  const serializedExercises = serializeExerciseCandidates(exerciseCandidates).slice(0, AI_EXERCISE_SEND_LIMIT);

  const systemPrompt = `
You are an experienced strength and conditioning coach.
Your job is to select exercises ONLY from the supplied PostgreSQL candidate list.
CRITICAL DATABASE RULE:
- NEVER invent an exercise or an exercise ID.
- Every workout exercise MUST reference a supplied exerciseId.
- exerciseId is the source of truth.
Training principles:
- Match experience level, available equipment, days per week, and goal.
- Use progressive overload, avoid excessive volume, give practical form cues.
- Do not diagnose injuries or medical conditions.
- Return only JSON matching the supplied schema.
`;

  const prompt = `
Create a personalized workout plan.
USER PROFILE:
${JSON.stringify(userProfile)}
ALLOWED EXERCISES FROM POSTGRESQL:
${JSON.stringify(serializedExercises)}
STRICT EXERCISE RULES:
1. Only select exercise IDs from the ALLOWED EXERCISES list.
2. Every exercise must contain exerciseId, sets, reps, restSeconds, formCues, notes.
3. Never invent exercise IDs or use exercises outside the list.
4. Respect equipment, experience level, days per week, and session duration.
USER GOAL: ${userProfile.goal || 'General Fitness'}
EXPERIENCE: ${userProfile.experienceLevel || 'intermediate'}
DAYS PER WEEK: ${userProfile.daysPerWeek || 4}
AVAILABLE EQUIPMENT: ${JSON.stringify(userProfile.availableEquipment || [])}
INJURIES / LIMITATIONS: ${JSON.stringify(userProfile.injuries || userProfile.limitations || [])}
Return exactly the requested JSON structure.
`;

  const result = await generateWithAI(prompt, systemPrompt, {
    temperature: 0.25,
    maxTokens: 1500,
    responseSchema: WORKOUT_PLAN_SCHEMA,
    schemaName: 'personalized_workout_plan',
  });

  let plan;
  try {
    plan = parseAIJson(result.text);
  } catch (error) {
    return { raw: result.text, meta: { provider: result.provider, model: result.model, parseError: true, error: error.message } };
  }

  const validated = validateWorkoutPlan(plan, exerciseCandidates, userProfile);
  return {
    ...validated,
    meta: { provider: result.provider, model: result.model, candidateCount: exerciseCandidates.length, databaseBacked: true },
  };
}

// ============================================================
// EXPORTS
// ============================================================
module.exports = {
  generateWithAI,
  generateMealPlan,
  generateWorkoutPlan,
};