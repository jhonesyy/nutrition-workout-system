require('dotenv').config();

const Groq = require('groq-sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const pool = require('../config/db');

// ============================================================
// AI CLIENTS
// ============================================================

const groq = process.env.GROQ_API_KEY
  ? new Groq({
      apiKey: process.env.GROQ_API_KEY,
    })
  : null;

const genAI = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;

// Groq structured-output models.
// GPT-OSS 120B / 20B / Qwen 3.8 27B support JSON Schema mode.
// ============================================================

const GROQ_MODELS = [
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'qwen/qwen3.8-27b',
];

// Gemini fallback models.
// Keep 2.5 Flash first because it is already compatible
// with the GoogleGenerativeAI SDK used by this project.
// ============================================================

const GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
];

// ============================================================
// CONSTANTS
// ============================================================

const DEFAULT_TIMEOUT_MS = 25000;

const MAX_FOOD_CANDIDATES = 120;
const MAX_EXERCISE_CANDIDATES = 160;

// ============================================================
// HELPERS
// ============================================================

function normalizeString(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function normalizeArray(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || '').trim())
      .filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function clampNumber(value, min, max, fallback = min) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.min(Math.max(number, min), max);
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
}

function roundNumber(value, decimals = 1) {
  const factor = 10 ** decimals;
  return Math.round(safeNumber(value) * factor) / factor;
}

function cleanJsonText(text) {
  if (!text) {
    return '';
  }

  let cleaned = String(text).trim();

  // Remove markdown code fences if model ignores instructions.
  cleaned = cleaned
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  // Find first JSON object.
  const firstObject = cleaned.indexOf('{');
  const lastObject = cleaned.lastIndexOf('}');

  if (firstObject !== -1 && lastObject > firstObject) {
    cleaned = cleaned.slice(firstObject, lastObject + 1);
  }

  return cleaned;
}

function parseAIJson(text) {
  const cleaned = cleanJsonText(text);

  if (!cleaned) {
    throw new Error('AI returned empty response');
  }

  try {
    return JSON.parse(cleaned);
  } catch (error) {
    throw new Error(`AI returned invalid JSON: ${error.message}`);
  }
}

// ============================================================
// JSON SCHEMAS
// ============================================================

const MEAL_PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'dailySummary',
    'meals',
    'tips',
  ],
  properties: {
    dailySummary: {
      type: 'object',
      additionalProperties: false,
      required: [
        'targetCalories',
        'actualCalories',
        'protein_g',
        'carbs_g',
        'fat_g',
      ],
      properties: {
        targetCalories: {
          type: 'number',
        },
        actualCalories: {
          type: 'number',
        },
        protein_g: {
          type: 'number',
        },
        carbs_g: {
          type: 'number',
        },
        fat_g: {
          type: 'number',
        },
      },
    },

    meals: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'name',
          'time',
          'items',
          'calories',
          'protein_g',
          'carbs_g',
          'fat_g',
          'notes',
        ],
        properties: {
          name: {
            type: 'string',
          },
          time: {
            type: 'string',
          },
          items: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: [
                'foodId',
                'portion_g',
              ],
              properties: {
                foodId: {
                  type: 'integer',
                },
                portion_g: {
                  type: 'number',
                },
              },
            },
          },
          calories: {
            type: 'number',
          },
          protein_g: {
            type: 'number',
          },
          carbs_g: {
            type: 'number',
          },
          fat_g: {
            type: 'number',
          },
          notes: {
            type: 'string',
          },
        },
      },
    },

    tips: {
      type: 'array',
      items: {
        type: 'string',
      },
    },
  },
};

const WORKOUT_PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'focus',
    'daysPerWeek',
    'sessionDurationMinutes',
    'workouts',
    'progressionNotes',
    'warmup',
    'cooldown',
  ],
  properties: {
    focus: {
      type: 'string',
    },

    daysPerWeek: {
      type: 'integer',
    },

    sessionDurationMinutes: {
      type: 'integer',
    },

    workouts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'day',
          'exercises',
        ],
        properties: {
          day: {
            type: 'string',
          },

          exercises: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: [
                'exerciseId',
                'sets',
                'reps',
                'restSeconds',
                'formCues',
                'notes',
              ],
              properties: {
                exerciseId: {
                  type: 'integer',
                },

                sets: {
                  type: 'integer',
                },

                reps: {
                  type: 'string',
                },

                restSeconds: {
                  type: 'integer',
                },

                formCues: {
                  type: 'array',
                  items: {
                    type: 'string',
                  },
                },

                notes: {
                  type: 'string',
                },
              },
            },
          },
        },
      },
    },

    progressionNotes: {
      type: 'string',
    },

    warmup: {
      type: 'array',
      items: {
        type: 'string',
      },
    },

    cooldown: {
      type: 'array',
      items: {
        type: 'string',
      },
    },
  },
};

// ============================================================
// AI GENERATION
// ============================================================

async function generateWithAI(
  prompt,
  systemPrompt = null,
  options = {}
) {
  const {
    temperature = 0.4,
    maxTokens = 2048,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    responseSchema = null,
    schemaName = 'structured_response',
  } = options;

  const messages = [];

  if (systemPrompt) {
    messages.push({
      role: 'system',
      content: systemPrompt,
    });
  }

  messages.push({
    role: 'user',
    content: prompt,
  });

  // ==========================================================
  // 1. GROQ
  // ==========================================================

  if (groq) {
    for (const model of GROQ_MODELS) {
      let timeout;

      try {
        const controller = new AbortController();

        timeout = setTimeout(() => {
          controller.abort();
        }, timeoutMs);

        const request = {
          model,
          messages,
          temperature,
          max_tokens: maxTokens,
        };

        // Structured JSON Schema.
        if (responseSchema) {
          request.response_format = {
            type: 'json_schema',
            json_schema: {
              name: schemaName,
              strict: true,
              schema: responseSchema,
            },
          };
        }

        const completion = await groq.chat.completions.create(
          request,
          {
            signal: controller.signal,
          }
        );

        const text =
          completion.choices?.[0]?.message?.content?.trim();

        if (text) {
          return {
            text,
            provider: 'groq',
            model,
          };
        }

        throw new Error('Empty Groq response');
      } catch (err) {
        console.warn(
          `[Groq] ${model} failed:`,
          err.message
        );
      } finally {
        if (timeout) {
          clearTimeout(timeout);
        }
      }
    }
  }

  // ==========================================================
  // 2. GEMINI FALLBACK
  // ==========================================================

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
                  responseSchema,
                }
              : {}),
          },
        });

        const fullPrompt = systemPrompt
          ? `${systemPrompt}\n\n${prompt}`
          : prompt;

        const result = await model.generateContent(
          fullPrompt
        );

        const text = result.response
          .text()
          ?.trim();

        if (text) {
          return {
            text,
            provider: 'gemini',
            model: modelName,
          };
        }

        throw new Error('Empty Gemini response');
      } catch (err) {
        console.warn(
          `[Gemini] ${modelName} failed:`,
          err.message
        );
      }
    }
  }

  throw new Error(
    'All AI providers failed (Groq + Gemini)'
  );
}

// ============================================================
// FOOD ALLERGEN HELPERS
// ============================================================

const ALLERGEN_KEYWORDS = {
  milk: [
    'milk',
    'dairy',
    'cheese',
    'cheddar',
    'yogurt',
    'yoghurt',
    'cream',
    'butter',
    'whey',
    'casein',
    'condensed milk',
    'evaporated milk',
  ],

  egg: [
    'egg',
    'eggs',
    'mayonnaise',
    'mayo',
  ],

  fish: [
    'fish',
    'tuna',
    'salmon',
    'tilapia',
    'bangus',
    'milkfish',
    'sardine',
    'sardines',
    'anchovy',
    'anchovies',
    'mackerel',
  ],

  shellfish: [
    'shrimp',
    'prawn',
    'crab',
    'lobster',
    'clam',
    'mussel',
    'oyster',
    'scallop',
    'shellfish',
  ],

  soy: [
    'soy',
    'soya',
    'tofu',
    'tempeh',
    'edamame',
    'soybean',
  ],

  peanut: [
    'peanut',
    'peanuts',
    'groundnut',
  ],

  tree_nut: [
    'almond',
    'almonds',
    'cashew',
    'cashews',
    'walnut',
    'walnuts',
    'pistachio',
    'pistachios',
    'hazelnut',
    'hazelnuts',
    'pecan',
    'pecans',
    'macadamia',
  ],

  wheat: [
    'wheat',
    'flour',
    'bread',
    'pasta',
    'noodle',
    'noodles',
  ],

  gluten: [
    'wheat',
    'bread',
    'pasta',
    'noodle',
    'noodles',
    'flour',
    'barley',
    'rye',
  ],
};

function normalizeAllergen(allergen) {
  return normalizeString(allergen)
    .replace(/-/g, '_')
    .replace(/\s+/g, '_');
}

function foodMatchesAllergens(food, allergens) {
  const normalizedAllergens = allergens
    .map(normalizeAllergen)
    .filter(Boolean);

  if (normalizedAllergens.length === 0) {
    return false;
  }

  const dbTags = Array.isArray(food.allergen_tags)
    ? food.allergen_tags
        .map(normalizeAllergen)
        .filter(Boolean)
    : [];

  const searchableText = [
    food.name,
    food.brand,
    ...dbTags,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  for (const allergen of normalizedAllergens) {
    // Explicit DB allergen tag.
    if (
      dbTags.some(
        (tag) =>
          tag === allergen ||
          tag.includes(allergen) ||
          allergen.includes(tag)
      )
    ) {
      return true;
    }

    // Conservative keyword protection.
    const keywords =
      ALLERGEN_KEYWORDS[allergen] || [];

    for (const keyword of keywords) {
      if (
        searchableText.includes(
          keyword.toLowerCase()
        )
      ) {
        return true;
      }
    }
  }

  return false;
}

// ============================================================
// FOOD CANDIDATES
// ============================================================

async function getFoodCandidates(userProfile) {
  const allergens = normalizeArray(
    userProfile.allergens
  );

  const preferredCuisine =
    userProfile.preferredCuisine ||
    'Filipino + International';

  const limit = clampNumber(
    userProfile.foodCandidateLimit,
    30,
    MAX_FOOD_CANDIDATES,
    MAX_FOOD_CANDIDATES
  );

  const result = await pool.query(
    `
      SELECT
        id,
        name,
        brand,
        serving_size,
        calories,
        protein_g,
        carbs_g,
        fat_g,
        fiber_g,
        allergen_tags,
        source
      FROM foods
      WHERE is_active = TRUE
      ORDER BY
        CASE
          WHEN LOWER(source) = 'philfct' THEN 0
          WHEN LOWER(source) = 'seed' THEN 1
          ELSE 2
        END,
        id
      LIMIT $1
    `,
    [limit]
  );

  // Final application-side allergen filtering.
  const safeFoods = result.rows.filter(
    (food) =>
      !foodMatchesAllergens(
        food,
        allergens
      )
  );

  if (safeFoods.length === 0) {
    throw new Error(
      'No safe food candidates available for the selected allergen restrictions'
    );
  }

  return safeFoods;
}

// ============================================================
// EXERCISE CANDIDATES
// ============================================================

function exerciseMatchesEquipment(
  exercise,
  availableEquipment
) {
  if (
    !Array.isArray(availableEquipment) ||
    availableEquipment.length === 0
  ) {
    return true;
  }

  const equipment =
    normalizeString(exercise.equipment);

  // Bodyweight exercises.
  if (
    !equipment ||
    equipment === 'body only' ||
    equipment === 'bodyweight'
  ) {
    return availableEquipment.some((item) => {
      const normalized = normalizeString(item);

      return (
        normalized === 'bodyweight' ||
        normalized === 'body only' ||
        normalized === 'none' ||
        normalized === 'no equipment'
      );
    });
  }

  return availableEquipment.some(
    (item) => {
      const normalized = normalizeString(item);

      return (
        equipment.includes(normalized) ||
        normalized.includes(equipment)
      );
    }
  );
}

function exerciseMatchesDifficulty(
  exercise,
  experienceLevel
) {
  if (!experienceLevel) {
    return true;
  }

  const requested =
    normalizeString(experienceLevel);

  const actual =
    normalizeString(exercise.difficulty);

  if (!actual) {
    return true;
  }

  if (
    requested === 'beginner' &&
    actual === 'beginner'
  ) {
    return true;
  }

  if (
    requested === 'intermediate' &&
    (
      actual === 'beginner' ||
      actual === 'intermediate'
    )
  ) {
    return true;
  }

  if (
    requested === 'advanced' ||
    requested === 'expert'
  ) {
    return true;
  }

  return actual === requested;
}

async function getExerciseCandidates(userProfile) {
  const availableEquipment =
    normalizeArray(
      userProfile.availableEquipment
    );

  const experienceLevel =
    userProfile.experienceLevel ||
    'intermediate';

  const limit = clampNumber(
    userProfile.exerciseCandidateLimit,
    40,
    MAX_EXERCISE_CANDIDATES,
    MAX_EXERCISE_CANDIDATES
  );

  const result = await pool.query(
    `
      SELECT
        id,
        name,
        muscle_group,
        equipment,
        difficulty,
        default_sets,
        default_reps,
        rest_seconds,
        common_errors,
        form_tips
      FROM exercises
      ORDER BY
        CASE
          WHEN difficulty = $1 THEN 0
          WHEN difficulty = 'Beginner' THEN 1
          ELSE 2
        END,
        id
      LIMIT $2
    `,
    [
      experienceLevel === 'advanced'
        ? 'Advanced'
        : experienceLevel === 'beginner'
          ? 'Beginner'
          : 'Intermediate',
      limit,
    ]
  );

  let candidates = result.rows.filter(
    (exercise) =>
      exerciseMatchesDifficulty(
        exercise,
        experienceLevel
      )
  );

  // Only enforce equipment when user actually supplied
  // equipment restrictions.
  if (availableEquipment.length > 0) {
    const equipmentFiltered =
      candidates.filter(
        (exercise) =>
          exerciseMatchesEquipment(
            exercise,
            availableEquipment
          )
      );

    if (equipmentFiltered.length > 0) {
      candidates = equipmentFiltered;
    }
  }

  if (candidates.length === 0) {
    throw new Error(
      'No suitable exercise candidates available'
    );
  }

  return candidates;
}

// ============================================================
// CANDIDATE SERIALIZATION
// ============================================================

function serializeFoodCandidates(foods) {
  return foods.map((food) => ({
    id: food.id,
    name: food.name,
    brand: food.brand,
    servingSize: food.serving_size,
    caloriesPer100g: safeNumber(food.calories),
    proteinPer100g: safeNumber(food.protein_g),
    carbsPer100g: safeNumber(food.carbs_g),
    fatPer100g: safeNumber(food.fat_g),
    fiberPer100g: safeNumber(food.fiber_g),
  }));
}

function serializeExerciseCandidates(exercises) {
  return exercises.map((exercise) => ({
    id: exercise.id,
    name: exercise.name,
    muscleGroup: exercise.muscle_group,
    equipment: exercise.equipment,
    difficulty: exercise.difficulty,
    defaultSets: exercise.default_sets,
    defaultReps: exercise.default_reps,
    restSeconds: exercise.rest_seconds,
    formTips: exercise.form_tips,
    commonErrors: exercise.common_errors,
  }));
}

// ============================================================
// MEAL NUTRITION CALCULATION
// ============================================================

function calculateFoodNutrition(
  food,
  portionGrams
) {
  const grams = clampNumber(
    portionGrams,
    1,
    1000,
    100
  );

  const multiplier = grams / 100;

  return {
    calories: roundNumber(
      safeNumber(food.calories) * multiplier
    ),

    protein_g: roundNumber(
      safeNumber(food.protein_g) * multiplier
    ),

    carbs_g: roundNumber(
      safeNumber(food.carbs_g) * multiplier
    ),

    fat_g: roundNumber(
      safeNumber(food.fat_g) * multiplier
    ),

    fiber_g: roundNumber(
      safeNumber(food.fiber_g) * multiplier
    ),
  };
}

// ============================================================
// VALIDATE MEAL PLAN
// ============================================================

function validateMealPlan(
  rawPlan,
  foodCandidates,
  userProfile
) {
  if (
    !rawPlan ||
    typeof rawPlan !== 'object'
  ) {
    throw new Error(
      'AI meal plan is not an object'
    );
  }

  if (!Array.isArray(rawPlan.meals)) {
    throw new Error(
      'AI meal plan has no meals array'
    );
  }

  const foodMap = new Map(
    foodCandidates.map(
      (food) => [Number(food.id), food]
    )
  );

  const allergens = normalizeArray(
    userProfile.allergens
  );

  const meals = rawPlan.meals.map(
    (meal, mealIndex) => {
      if (
        !meal ||
        !Array.isArray(meal.items)
      ) {
        throw new Error(
          `Meal ${mealIndex + 1} has invalid items`
        );
      }

      const validatedItems =
        meal.items.map(
          (item, itemIndex) => {
            const foodId =
              Number(item.foodId);

            const food =
              foodMap.get(foodId);

            if (!food) {
              throw new Error(
                `AI selected food ID ${foodId}, but that food is not an allowed candidate`
              );
            }

            if (
              foodMatchesAllergens(
                food,
                allergens
              )
            ) {
              throw new Error(
                `AI selected allergenic food: ${food.name}`
              );
            }

            const portionGrams =
              clampNumber(
                item.portion_g,
                10,
                1000,
                100
              );

            const nutrition =
              calculateFoodNutrition(
                food,
                portionGrams
              );

            return {
              foodId: food.id,
              name: food.name,
              brand: food.brand || null,
              portion_g: portionGrams,
              serving_size:
                food.serving_size || '100 g',
              calories:
                nutrition.calories,
              protein_g:
                nutrition.protein_g,
              carbs_g:
                nutrition.carbs_g,
              fat_g:
                nutrition.fat_g,
              fiber_g:
                nutrition.fiber_g,
              display:
                `${food.name} — ${portionGrams} g`,
            };
          }
        );

      const calculated =
        validatedItems.reduce(
          (total, item) => ({
            calories:
              total.calories +
              item.calories,

            protein_g:
              total.protein_g +
              item.protein_g,

            carbs_g:
              total.carbs_g +
              item.carbs_g,

            fat_g:
              total.fat_g +
              item.fat_g,

            fiber_g:
              total.fiber_g +
              item.fiber_g,
          }),
          {
            calories: 0,
            protein_g: 0,
            carbs_g: 0,
            fat_g: 0,
            fiber_g: 0,
          }
        );

      return {
        name:
          meal.name ||
          `Meal ${mealIndex + 1}`,

        time:
          meal.time ||
          '',

        items:
          validatedItems.map(
            (item) => item.display
          ),

        foodItems:
          validatedItems,

        // Do NOT trust AI nutrition.
        // Use DB nutrition.
        calories:
          roundNumber(
            calculated.calories
          ),

        protein_g:
          roundNumber(
            calculated.protein_g
          ),

        carbs_g:
          roundNumber(
            calculated.carbs_g
          ),

        fat_g:
          roundNumber(
            calculated.fat_g
          ),

        fiber_g:
          roundNumber(
            calculated.fiber_g
          ),

        notes:
          typeof meal.notes === 'string'
            ? meal.notes
            : '',
      };
    }
  );

  const daily = meals.reduce(
    (total, meal) => ({
      calories:
        total.calories +
        meal.calories,

      protein_g:
        total.protein_g +
        meal.protein_g,

      carbs_g:
        total.carbs_g +
        meal.carbs_g,

      fat_g:
        total.fat_g +
        meal.fat_g,

      fiber_g:
        total.fiber_g +
        meal.fiber_g,
    }),
    {
      calories: 0,
      protein_g: 0,
      carbs_g: 0,
      fat_g: 0,
      fiber_g: 0,
    }
  );

  const targetCalories =
    safeNumber(
      userProfile.targetCalories ||
      userProfile.tdee ||
      rawPlan.dailySummary?.targetCalories
    );

  return {
    dailySummary: {
      targetCalories:
        roundNumber(targetCalories),

      actualCalories:
        roundNumber(
          daily.calories
        ),

      protein_g:
        roundNumber(
          daily.protein_g
        ),

      carbs_g:
        roundNumber(
          daily.carbs_g
        ),

      fat_g:
        roundNumber(
          daily.fat_g
        ),

      fiber_g:
        roundNumber(
          daily.fiber_g
        ),
    },

    meals,

    tips:
      Array.isArray(rawPlan.tips)
        ? rawPlan.tips
            .filter(
              (tip) =>
                typeof tip === 'string'
            )
            .slice(0, 10)
        : [],

    validation: {
      source: 'postgresql',
      foodCandidates:
        foodCandidates.length,
      aiSelectedOnlyFromCandidates: true,
      nutritionCalculatedFromDatabase: true,
      allergensChecked: true,
    },
  };
}

// ============================================================
// VALIDATE WORKOUT PLAN
// ============================================================

function validateWorkoutPlan(
  rawPlan,
  exerciseCandidates,
  userProfile
) {
  if (
    !rawPlan ||
    typeof rawPlan !== 'object'
  ) {
    throw new Error(
      'AI workout plan is not an object'
    );
  }

  if (
    !Array.isArray(rawPlan.workouts)
  ) {
    throw new Error(
      'AI workout plan has no workouts array'
    );
  }

  const exerciseMap = new Map(
    exerciseCandidates.map(
      (exercise) => [
        Number(exercise.id),
        exercise,
      ]
    )
  );

  const workouts =
    rawPlan.workouts.map(
      (workout, workoutIndex) => {
        if (
          !workout ||
          !Array.isArray(
            workout.exercises
          )
        ) {
          throw new Error(
            `Workout ${workoutIndex + 1} has invalid exercises`
          );
        }

        const exercises =
          workout.exercises.map(
            (item) => {
              const exerciseId =
                Number(item.exerciseId);

              const exercise =
                exerciseMap.get(
                  exerciseId
                );

              if (!exercise) {
                throw new Error(
                  `AI selected exercise ID ${exerciseId}, but that exercise is not an allowed candidate`
                );
              }

              const sets =
                clampNumber(
                  item.sets,
                  1,
                  10,
                  exercise.default_sets ||
                    3
                );

              const restSeconds =
                clampNumber(
                  item.restSeconds,
                  15,
                  600,
                  exercise.rest_seconds ||
                    90
                );

              const reps =
                String(
                  item.reps ||
                  exercise.default_reps ||
                  '8-12'
                ).slice(0, 50);

              const formCues =
                Array.isArray(
                  item.formCues
                )
                  ? item.formCues
                      .filter(
                        (cue) =>
                          typeof cue ===
                          'string'
                      )
                      .slice(0, 6)
                  : [];

              // Use DB form tips if AI gives no cues.
              if (
                formCues.length === 0 &&
                exercise.form_tips
              ) {
                formCues.push(
                  exercise.form_tips
                );
              }

              return {
                exerciseId:
                  exercise.id,

                name:
                  exercise.name,

                muscleGroup:
                  exercise.muscle_group,

                equipment:
                  exercise.equipment,

                difficulty:
                  exercise.difficulty,

                sets,

                reps,

                restSeconds,

                formCues,

                notes:
                  typeof item.notes ===
                  'string'
                    ? item.notes
                    : '',

                dbFormTips:
                  exercise.form_tips ||
                  null,

                dbCommonErrors:
                  exercise.common_errors ||
                  null,
              };
            }
          );

        return {
          day:
            workout.day ||
            `Day ${workoutIndex + 1}`,

          exercises,
        };
      }
    );

  return {
    focus:
      rawPlan.focus ||
      userProfile.goal ||
      'General Fitness',

    daysPerWeek:
      clampNumber(
        rawPlan.daysPerWeek,
        1,
        7,
        userProfile.daysPerWeek || 4
      ),

    sessionDurationMinutes:
      clampNumber(
        rawPlan.sessionDurationMinutes,
        15,
        180,
        60
      ),

    workouts,

    progressionNotes:
      rawPlan.progressionNotes ||
      '',

    warmup:
      Array.isArray(rawPlan.warmup)
        ? rawPlan.warmup
            .filter(
              (item) =>
                typeof item ===
                'string'
            )
            .slice(0, 10)
        : [],

    cooldown:
      Array.isArray(rawPlan.cooldown)
        ? rawPlan.cooldown
            .filter(
              (item) =>
                typeof item ===
                'string'
            )
            .slice(0, 10)
        : [],

    validation: {
      source: 'postgresql',
      exerciseCandidates:
        exerciseCandidates.length,
      aiSelectedOnlyFromCandidates: true,
      exerciseIdsValidated: true,
    },
  };
}

// ============================================================
// MEAL PLAN
// ============================================================

async function generateMealPlan(
  userProfile
) {
  // ----------------------------------------------------------
  // 1. Get safe foods from PostgreSQL.
  // ----------------------------------------------------------

  const foodCandidates =
    await getFoodCandidates(
      userProfile
    );

  const serializedFoods =
    serializeFoodCandidates(
      foodCandidates
    );

  // ----------------------------------------------------------
  // 2. System prompt.
  // ----------------------------------------------------------

  const systemPrompt = `
You are a practical sports nutritionist working with House of Strength GYM in the Philippines.

Your job is to select foods ONLY from the supplied PostgreSQL candidate list.

CRITICAL DATABASE RULE:
- NEVER invent a food.
- NEVER create a food ID.
- NEVER use a food ID not present in the candidate list.
- Every meal item MUST reference one supplied food ID.
- Do not output food names as the source of truth. foodId is the source of truth.
- Portion is in grams.
- Nutrition values will be calculated by the application from PostgreSQL.
- Do not attempt to override database nutrition.

Nutrition planning:
- Prefer affordable Filipino foods.
- Prefer foods common in Filipino homes, markets, carinderias, and gyms.
- Respect the user's target calories/macros.
- Use realistic portions.
- Create Breakfast, Lunch, Dinner, and 2 Snacks when possible.
- Completely avoid supplied allergen restrictions.
- Do not invent medical facts.
- Do not diagnose disease.
- Return only JSON matching the supplied schema.
`;

  // ----------------------------------------------------------
  // 3. Prompt.
  // ----------------------------------------------------------

  const prompt = `
Create a full-day personalized meal plan.

USER PROFILE:
${JSON.stringify(
  userProfile,
  null,
  2
)}

ALLOWED FOOD CANDIDATES FROM POSTGRESQL:
${JSON.stringify(
  serializedFoods,
  null,
  2
)}

STRICT FOOD RULES:

1. You may ONLY select food IDs from the ALLOWED FOOD CANDIDATES list.
2. Every item must have:
   - foodId
   - portion_g
3. Never invent food IDs.
4. Never use foods outside the supplied list.
5. Use 4-5 eating occasions:
   - Breakfast
   - Lunch
   - Dinner
   - Snack
   - Snack
6. Keep portions realistic.
7. Prefer Filipino-friendly combinations.
8. Respect allergens.
9. Target calories:
   ${safeNumber(
     userProfile.targetCalories ||
     userProfile.tdee
   )}
10. Target protein:
   ${safeNumber(
     userProfile.protein_g
   )} g
11. Target carbs:
   ${safeNumber(
     userProfile.carbs_g
   )} g
12. Target fat:
   ${safeNumber(
     userProfile.fat_g
   )} g

IMPORTANT:
The application calculates nutrition from the database after you respond.

Therefore:
- Do not fabricate nutrition.
- Do not add nutrition fields to food items.
- Only select foodId + portion_g.

Return exactly the requested JSON structure.
`;

  // ----------------------------------------------------------
  // 4. AI.
  // ----------------------------------------------------------

  const result =
    await generateWithAI(
      prompt,
      systemPrompt,
      {
        temperature: 0.25,
        maxTokens: 3000,
        responseSchema:
          MEAL_PLAN_SCHEMA,
        schemaName:
          'nutrition_meal_plan',
      }
    );

  // ----------------------------------------------------------
  // 5. Parse.
  // ----------------------------------------------------------

  let plan;

  try {
    plan = parseAIJson(
      result.text
    );
  } catch (error) {
    return {
      raw: result.text,

      meta: {
        provider:
          result.provider,

        model:
          result.model,

        parseError: true,

        error:
          error.message,
      },
    };
  }

  // ----------------------------------------------------------
  // 6. Validate against DB.
  // ----------------------------------------------------------

  const validated =
    validateMealPlan(
      plan,
      foodCandidates,
      userProfile
    );

  return {
    ...validated,

    meta: {
      provider:
        result.provider,

      model:
        result.model,

      candidateCount:
        foodCandidates.length,

      databaseBacked: true,
    },
  };
}

// ============================================================
// WORKOUT PLAN
// ============================================================

async function generateWorkoutPlan(
  userProfile
) {
  // ----------------------------------------------------------
  // 1. Get allowed exercises.
  // ----------------------------------------------------------

  const exerciseCandidates =
    await getExerciseCandidates(
      userProfile
    );

  const serializedExercises =
    serializeExerciseCandidates(
      exerciseCandidates
    );

  // ----------------------------------------------------------
  // 2. System prompt.
  // ----------------------------------------------------------

  const systemPrompt = `
You are an experienced strength and conditioning coach.

Your job is to select exercises ONLY from the supplied PostgreSQL candidate list.

CRITICAL DATABASE RULE:
- NEVER invent an exercise.
- NEVER create an exercise ID.
- NEVER use an exercise ID not present in the candidate list.
- Every workout exercise MUST reference a supplied exerciseId.
- exerciseId is the source of truth.
- Use the supplied database form tips and exercise information when appropriate.

Training principles:
- Match the user's experience level.
- Respect available equipment.
- Respect days per week.
- Respect the user's goal.
- Use progressive overload.
- Avoid excessive volume.
- Give practical form cues.
- Do not diagnose injuries or medical conditions.
- If limitations are supplied, respect them.
- Return only JSON matching the supplied schema.
`;

  // ----------------------------------------------------------
  // 3. Prompt.
  // ----------------------------------------------------------

  const prompt = `
Create a personalized workout plan.

USER PROFILE:
${JSON.stringify(
  userProfile,
  null,
  2
)}

ALLOWED EXERCISES FROM POSTGRESQL:
${JSON.stringify(
  serializedExercises,
  null,
  2
)}

STRICT EXERCISE RULES:

1. You may ONLY select exercise IDs from the ALLOWED EXERCISES list.
2. Every exercise must contain:
   - exerciseId
   - sets
   - reps
   - restSeconds
   - formCues
   - notes
3. Never invent an exercise ID.
4. Never use an exercise outside the supplied list.
5. Respect available equipment.
6. Respect experience level.
7. Respect requested days per week.
8. Respect session duration.
9. Use sensible exercise ordering.
10. Avoid unnecessary duplicate movements.

USER GOAL:
${userProfile.goal || 'General Fitness'}

EXPERIENCE:
${
  userProfile.experienceLevel ||
  'intermediate'
}

DAYS PER WEEK:
${
  userProfile.daysPerWeek ||
  4
}

AVAILABLE EQUIPMENT:
${JSON.stringify(
  userProfile.availableEquipment ||
  []
)}

INJURIES / LIMITATIONS:
${JSON.stringify(
  userProfile.injuries ||
  userProfile.limitations ||
  []
)}

Return exactly the requested JSON structure.
`;

  // ----------------------------------------------------------
  // 4. AI.
  // ----------------------------------------------------------

  const result =
    await generateWithAI(
      prompt,
      systemPrompt,
      {
        temperature: 0.25,
        maxTokens: 3000,
        responseSchema:
          WORKOUT_PLAN_SCHEMA,
        schemaName:
          'personalized_workout_plan',
      }
    );

  // ----------------------------------------------------------
  // 5. Parse.
  // ----------------------------------------------------------

  let plan;

  try {
    plan = parseAIJson(
      result.text
    );
  } catch (error) {
    return {
      raw: result.text,

      meta: {
        provider:
          result.provider,

        model:
          result.model,

        parseError: true,

        error:
          error.message,
      },
    };
  }

  // ----------------------------------------------------------
  // 6. Validate against DB.
  // ----------------------------------------------------------

  const validated =
    validateWorkoutPlan(
      plan,
      exerciseCandidates,
      userProfile
    );

  return {
    ...validated,

    meta: {
      provider:
        result.provider,

      model:
        result.model,

      candidateCount:
        exerciseCandidates.length,

      databaseBacked: true,
    },
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