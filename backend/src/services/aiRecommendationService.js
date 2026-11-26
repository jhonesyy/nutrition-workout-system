require('dotenv').config();

const Groq = require('groq-sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const pool = require('../config/db');

// ============================================================
// AI CLIENTS
// ============================================================
const groq = process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;
const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;

// Prefer qwen first — gpt-oss models often fail strict JSON validation on free tier
const GROQ_MODELS = ['qwen/qwen3.8-27b', 'openai/gpt-oss-20b', 'openai/gpt-oss-120b'];
// Gemini 2.5 family is gone for new users
const GEMINI_MODELS = ['gemini-3.8-flash', 'gemini-3.5-flash-lite'];

// ============================================================
// CONSTANTS
// ============================================================
const DEFAULT_TIMEOUT_MS = 30000;
const MAX_FOOD_CANDIDATES = 120;
const MAX_EXERCISE_CANDIDATES = 160;
const AI_FOOD_SEND_LIMIT = 25;
const AI_EXERCISE_SEND_LIMIT = 25;

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

function normalizeWorkoutPlanShape(raw) {
  if (!raw || typeof raw !== 'object') return raw;
  if (Array.isArray(raw.workouts)) return raw;

  const altKeys = ['days', 'schedule', 'weeklyPlan', 'weekly_plan', 'plan', 'sessions', 'workoutDays', 'workout_days'];
  for (const key of altKeys) {
    if (Array.isArray(raw[key])) return { ...raw, workouts: raw[key] };
  }

  if (raw.data && typeof raw.data === 'object') {
    const nested = normalizeWorkoutPlanShape(raw.data);
    if (Array.isArray(nested.workouts)) return nested;
  }
  if (raw.result && typeof raw.result === 'object') {
    const nested = normalizeWorkoutPlanShape(raw.result);
    if (Array.isArray(nested.workouts)) return nested;
  }
  if (raw.workoutPlan && typeof raw.workoutPlan === 'object') {
    const nested = normalizeWorkoutPlanShape(raw.workoutPlan);
    if (Array.isArray(nested.workouts)) return nested;
  }
  if (raw.workout_plan && typeof raw.workout_plan === 'object') {
    const nested = normalizeWorkoutPlanShape(raw.workout_plan);
    if (Array.isArray(nested.workouts)) return nested;
  }

  if (Array.isArray(raw) && raw.length > 0 && (raw[0].day || raw[0].exercises || raw[0].name)) {
    return { workouts: raw, focus: 'General Fitness', daysPerWeek: raw.length };
  }
  return raw;
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
    maxTokens = 800,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    responseSchema = null,
  } = options;

  const messages = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: prompt });

  const errors = [];

  // 1. GROQ
  if (groq) {
    for (const model of GROQ_MODELS) {
      let timeout;
      try {
        const controller = new AbortController();
        timeout = setTimeout(() => controller.abort(), timeoutMs);

        const request = {
          model,
          messages,
          temperature,
          max_tokens: maxTokens,
        };
        if (responseSchema) {
          request.response_format = { type: 'json_object' };
        }

        const completion = await groq.chat.completions.create(request, { signal: controller.signal });
        const text = completion.choices?.[0]?.message?.content?.trim();
        if (text) {
          console.log(`[AI] Groq ${model} returned ${text.length} chars`);
          return { text, provider: 'groq', model };
        }
        throw new Error('Empty Groq response');
      } catch (err) {
        const msg = err.message || String(err);
        if (msg.includes('json_validate_failed') || msg.includes('rate_limit') || msg.includes('tokens')) {
          console.log(`[Groq] ${model} skipped → trying next`);
        } else {
          console.warn(`[Groq] ${model} failed:`, msg);
        }
        errors.push(`groq/${model}: ${msg}`);
      } finally {
        if (timeout) clearTimeout(timeout);
      }
    }
  }

  // 2. GEMINI
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
                  responseSchema: sanitizeSchemaForGemini(responseSchema),
                }
              : {}),
          },
        });

        const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;
        const result = await model.generateContent(fullPrompt);
        const text = result.response.text()?.trim();
        if (text) {
          console.log(`[AI] Gemini ${modelName} returned ${text.length} chars`);
          return { text, provider: 'gemini', model: modelName };
        }
        throw new Error('Empty Gemini response');
      } catch (err) {
        const msg = err.message || String(err);
        console.warn(`[Gemini] ${modelName} failed:`, msg);
        errors.push(`gemini/${modelName}: ${msg}`);
      }
    }
  }

  throw new Error(`All AI providers failed (Groq + Gemini). Details: ${errors.join(' | ')}`);
}

// ============================================================
// FOOD ALLERGEN HELPERS
// ============================================================
const ALLERGEN_KEYWORDS = {
  milk: ['milk', 'dairy', 'cheese', 'cheddar', 'yogurt', 'yoghurt', 'cream', 'butter', 'whey', 'casein', 'condensed milk', 'evaporated milk'],
  egg: ['egg', 'eggs', 'mayonnaise', 'mayo'],
  fish: ['fish', 'tuna', 'salmon', 'tilapia', 'bangus', 'milkfish', 'sardine', 'sardines', 'anchovy', 'anchovies', 'mackerel'],
  shellfish: ['shrimp', 'prawn', 'crab', 'lobster', 'clam', 'mussel', 'oyster', 'scallop', 'shellfish'],
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
  const allergens = parseAllergenList(userProfile.allergens);
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
// CANDIDATE SERIALIZATION
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
// MEAL NUTRITION
// ============================================================
function calculateFoodNutrition(food, portionGrams) {
  const grams = clampNumber(portionGrams, 1, 1000, 100);
  const factor = grams / 100;
  return {
    calories: roundNumber(safeNumber(food.calories) * factor),
    protein_g: roundNumber(safeNumber(food.protein_g) * factor),
    carbs_g: roundNumber(safeNumber(food.carbs_g) * factor),
    fat_g: roundNumber(safeNumber(food.fat_g) * factor),
    fiber_g: roundNumber(safeNumber(food.fiber_g) * factor),
  };
}

// ============================================================
// VALIDATE MEAL PLAN
// ============================================================
function validateMealPlan(rawPlan, foodCandidates, userProfile) {
  if (!rawPlan || typeof rawPlan !== 'object') throw new Error('AI meal plan is not an object');
  if (!Array.isArray(rawPlan.meals)) throw new Error('AI meal plan has no meals array');

  const foodMap = new Map(foodCandidates.map((f) => [Number(f.id), f]));

  const meals = rawPlan.meals.map((meal, mealIndex) => {
    if (!meal || !Array.isArray(meal.items)) throw new Error(`Meal ${mealIndex + 1} has invalid items`);

    const items = meal.items.map((item) => {
      const foodId = Number(item.foodId);
      const food = foodMap.get(foodId);
      if (!food) throw new Error(`AI selected food ID ${foodId}, but that food is not an allowed candidate`);

      const portion_g = clampNumber(item.portion_g, 10, 800, 100);
      const nutrition = calculateFoodNutrition(food, portion_g);

      return {
        foodId: food.id,
        name: food.name,
        brand: food.brand || null,
        portion_g,
        ...nutrition,
      };
    });

    const mealTotals = items.reduce(
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
      items,
      calories: roundNumber(mealTotals.calories),
      protein_g: roundNumber(mealTotals.protein_g),
      carbs_g: roundNumber(mealTotals.carbs_g),
      fat_g: roundNumber(mealTotals.fat_g),
      fiber_g: roundNumber(mealTotals.fiber_g),
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

  const plan = normalizeWorkoutPlanShape(rawPlan);

  if (!Array.isArray(plan.workouts)) {
    console.error('[WorkoutPlan] Missing workouts array. Keys present:', Object.keys(plan || {}));
    throw new Error('AI workout plan has no workouts array');
  }

  const exerciseMap = new Map(exerciseCandidates.map((e) => [Number(e.id), e]));

  const workouts = plan.workouts.map((workout, workoutIndex) => {
    if (!workout || !Array.isArray(workout.exercises)) {
      throw new Error(`Workout ${workoutIndex + 1} has invalid exercises`);
    }

    const exercises = workout.exercises.map((item) => {
      const exerciseId = Number(item.exerciseId ?? item.id ?? item.exercise_id);
      const exercise = exerciseMap.get(exerciseId);
      if (!exercise) {
        throw new Error(`AI selected exercise ID ${exerciseId}, but that exercise is not an allowed candidate`);
      }

      const sets = clampNumber(item.sets, 1, 10, exercise.default_sets || 3);
      const restSeconds = clampNumber(item.restSeconds ?? item.rest_seconds ?? item.rest, 15, 600, exercise.rest_seconds || 90);
      const reps = String(item.reps || exercise.default_reps || '8-12').slice(0, 50);
      let formCues = Array.isArray(item.formCues)
        ? item.formCues.filter((c) => typeof c === 'string').slice(0, 6)
        : (Array.isArray(item.form_cues) ? item.form_cues.filter((c) => typeof c === 'string').slice(0, 6) : []);
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

    return {
      day: workout.day || workout.name || `Day ${workoutIndex + 1}`,
      title: workout.title || workout.focus || workout.day || `Day ${workoutIndex + 1}`,
      exercises,
    };
  });

  if (workouts.length === 0 || workouts.every((w) => w.exercises.length === 0)) {
    throw new Error('AI workout plan contains no usable exercises');
  }

  return {
    focus: plan.focus || plan.goal || userProfile.goal || 'General Fitness',
    title: plan.title || plan.focus || plan.goal || 'Personalized Workout Plan',
    daysPerWeek: clampNumber(plan.daysPerWeek ?? plan.days_per_week, 1, 7, userProfile.daysPerWeek || 4),
    sessionDurationMinutes: clampNumber(plan.sessionDurationMinutes ?? plan.session_duration_minutes, 15, 180, 60),
    workouts,
    progressionNotes: plan.progressionNotes || plan.progression_notes || '',
    warmup: Array.isArray(plan.warmup) ? plan.warmup.filter((i) => typeof i === 'string').slice(0, 10) : [],
    cooldown: Array.isArray(plan.cooldown) ? plan.cooldown.filter((i) => typeof i === 'string').slice(0, 10) : [],
    validation: {
      source: 'postgresql',
      exerciseCandidates: exerciseCandidates.length,
      aiSelectedOnlyFromCandidates: true,
      exerciseIdsValidated: true,
    },
  };
}

// ============================================================
// DETERMINISTIC FALLBACK WORKOUT PLAN
// ============================================================
function buildDeterministicWorkoutPlan(exerciseCandidates, userProfile) {
  const daysPerWeek = clampNumber(userProfile.daysPerWeek, 1, 6, 4);
  const goal = (userProfile.goal || 'General Fitness').toLowerCase();

  const byMuscle = (keys) =>
    exerciseCandidates.filter((e) => {
      const mg = normalizeString(e.muscle_group);
      return keys.some((k) => mg.includes(k));
    });

  const pushPool = byMuscle(['chest', 'shoulder', 'tricep', 'push']);
  const pullPool = byMuscle(['back', 'bicep', 'pull', 'lat']);
  const legPool = byMuscle(['leg', 'quad', 'hamstring', 'glute', 'calf']);
  const corePool = byMuscle(['core', 'abs', 'oblique']);
  const fullPool = exerciseCandidates;

  const pick = (pool, n) => {
    const src = pool.length ? pool : fullPool;
    const out = [];
    for (let i = 0; i < Math.min(n, src.length); i++) out.push(src[i % src.length]);
    return out;
  };

  const dayTemplates = [
    { day: 'Day 1 - Push', title: 'Push (Chest / Shoulders / Triceps)', pool: pushPool, count: 5 },
    { day: 'Day 2 - Pull', title: 'Pull (Back / Biceps)', pool: pullPool, count: 5 },
    { day: 'Day 3 - Legs', title: 'Legs & Glutes', pool: legPool, count: 5 },
    { day: 'Day 4 - Upper / Full', title: 'Upper Body + Core', pool: [...pushPool, ...pullPool, ...corePool], count: 5 },
    { day: 'Day 5 - Lower', title: 'Lower Body Focus', pool: legPool, count: 4 },
    { day: 'Day 6 - Full Body', title: 'Full Body', pool: fullPool, count: 5 },
  ];

  const workouts = dayTemplates.slice(0, daysPerWeek).map((tpl) => {
    const chosen = pick(tpl.pool, tpl.count);
    const exercises = chosen.map((ex) => ({
      exerciseId: ex.id,
      name: ex.name,
      muscleGroup: ex.muscle_group,
      equipment: ex.equipment,
      difficulty: ex.difficulty,
      sets: clampNumber(ex.default_sets, 2, 5, 3),
      reps: String(ex.default_reps || '8-12'),
      restSeconds: clampNumber(ex.rest_seconds, 30, 180, 90),
      formCues: ex.form_tips ? [ex.form_tips] : [],
      notes: goal.includes('strength') ? 'Focus on progressive overload' : 'Control the tempo',
      dbFormTips: ex.form_tips || null,
      dbCommonErrors: ex.common_errors || null,
    }));
    return { day: tpl.day, title: tpl.title, exercises };
  });

  return {
    focus: userProfile.goal || 'General Fitness',
    title: `Deterministic ${userProfile.goal || 'Fitness'} Plan`,
    daysPerWeek,
    sessionDurationMinutes: 50,
    workouts,
    progressionNotes: 'Increase weight or reps when you can complete all sets with good form.',
    warmup: ['5 min light cardio', 'Dynamic stretches', '2 light warm-up sets'],
    cooldown: ['Static stretching 5-8 min', 'Deep breathing', 'Hydrate'],
    validation: {
      source: 'postgresql-deterministic',
      exerciseCandidates: exerciseCandidates.length,
      aiSelectedOnlyFromCandidates: true,
      exerciseIdsValidated: true,
      fallback: true,
    },
  };
}

// ============================================================
// MEAL PLAN
// ============================================================
async function generateMealPlan(userProfile) {
  const foodCandidates = await getFoodCandidates(userProfile);
  const serializedFoods = serializeFoodCandidates(foodCandidates).slice(0, AI_FOOD_SEND_LIMIT);

  const systemPrompt = `You are a practical sports nutritionist.
Select foods ONLY from the supplied candidate list. Never invent food IDs.
Return ONLY valid JSON matching the schema. No markdown.`;

  const prompt = `Create a personalized daily meal plan.

USER PROFILE:
${JSON.stringify(userProfile)}

ALLOWED FOODS (use only these IDs):
${JSON.stringify(serializedFoods)}

Rules:
1. Only use foodId values from the list above.
2. Every item needs foodId + portion_g.
3. Hit target calories/macros as closely as possible.
4. Return pure JSON with keys: dailySummary, meals, tips.`;

  const result = await generateWithAI(prompt, systemPrompt, {
    temperature: 0.3,
    maxTokens: 800,
    responseSchema: MEAL_PLAN_SCHEMA,
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

  const systemPrompt = `You are a strength coach. Return ONLY valid JSON.
Top-level key MUST be "workouts" (array). Never invent exercise IDs.
Example shape:
{"focus":"...","daysPerWeek":4,"sessionDurationMinutes":55,"workouts":[{"day":"Monday","exercises":[{"exerciseId":12,"sets":3,"reps":"8-12","restSeconds":90,"formCues":["..."],"notes":"..."}]}],"progressionNotes":"...","warmup":["..."],"cooldown":["..."]}`;

  const prompt = `Create a personalized workout plan.

USER PROFILE:
${JSON.stringify(userProfile)}

ALLOWED EXERCISES (use only these IDs):
${JSON.stringify(serializedExercises)}

Rules:
1. Only use exerciseId from the list.
2. Top-level array key must be named "workouts".
3. Return pure JSON only.`;

  let result;
  try {
    result = await generateWithAI(prompt, systemPrompt, {
      temperature: 0.2,
      maxTokens: 800,
      responseSchema: WORKOUT_PLAN_SCHEMA,
    });
  } catch (aiError) {
    console.warn('[WorkoutPlan] All AI providers failed → deterministic fallback:', aiError.message);
    const fallback = buildDeterministicWorkoutPlan(exerciseCandidates, userProfile);
    return {
      ...fallback,
      meta: {
        provider: 'deterministic',
        model: 'rule-based',
        candidateCount: exerciseCandidates.length,
        databaseBacked: true,
        fallback: true,
        reason: aiError.message,
      },
    };
  }

  let plan;
  try {
    plan = parseAIJson(result.text);
  } catch (parseError) {
    console.warn('[WorkoutPlan] Parse failed → deterministic fallback');
    const fallback = buildDeterministicWorkoutPlan(exerciseCandidates, userProfile);
    return {
      ...fallback,
      meta: {
        provider: result.provider,
        model: result.model,
        candidateCount: exerciseCandidates.length,
        databaseBacked: true,
        fallback: true,
        parseError: true,
        reason: parseError.message,
      },
    };
  }

  try {
    const validated = validateWorkoutPlan(plan, exerciseCandidates, userProfile);
    return {
      ...validated,
      meta: {
        provider: result.provider,
        model: result.model,
        candidateCount: exerciseCandidates.length,
        databaseBacked: true,
        fallback: false,
      },
    };
  } catch (validationError) {
    console.warn('[WorkoutPlan] Validation failed → deterministic fallback:', validationError.message);
    const fallback = buildDeterministicWorkoutPlan(exerciseCandidates, userProfile);
    return {
      ...fallback,
      meta: {
        provider: result.provider,
        model: result.model,
        candidateCount: exerciseCandidates.length,
        databaseBacked: true,
        fallback: true,
        validationError: validationError.message,
      },
    };
  }
}

// ============================================================
// EXPORTS
// ============================================================
module.exports = {
  generateWithAI,
  generateMealPlan,
  generateWorkoutPlan,
};