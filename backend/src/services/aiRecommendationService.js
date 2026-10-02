require('dotenv').config();
const Groq = require('groq-sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize clients
const groq = process.env.GROQ_API_KEY
  ? new Groq({ apiKey: process.env.GROQ_API_KEY })
  : null;

const genAI = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;

// Best free models (as of Oct 2026)
const GROQ_MODELS = [
  'openai/gpt-oss-120b',   // best quality
  'openai/gpt-oss-20b',    // faster
  'qwen/qwen3.8-27b',      // alternative
];

const GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
];

/**
 * Core function: Generate text with Groq → Gemini fallback
 */
async function generateWithAI(prompt, systemPrompt = null, options = {}) {
  const {
    temperature = 0.4,
    maxTokens = 2048,
    timeoutMs = 25000,
  } = options;

  const messages = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: prompt });

  // 1. Try Groq first
  if (groq) {
    for (const model of GROQ_MODELS) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);

        const completion = await groq.chat.completions.create(
          {
            model,
            messages,
            temperature,
            max_tokens: maxTokens,
          },
          { signal: controller.signal }
        );

        clearTimeout(timeout);

        const text = completion.choices[0]?.message?.content?.trim();
        if (text) {
          return {
            text,
            provider: 'groq',
            model,
          };
        }
      } catch (err) {
        console.warn(`[Groq] ${model} failed:`, err.message);
        // Continue to next model / Gemini
      }
    }
  }

  // 2. Fallback to Gemini
  if (genAI) {
    for (const modelName of GEMINI_MODELS) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          generationConfig: {
            temperature,
            maxOutputTokens: maxTokens,
          },
        });

        const fullPrompt = systemPrompt
          ? `${systemPrompt}\n\n${prompt}`
          : prompt;

        const result = await model.generateContent(fullPrompt);
        const text = result.response.text()?.trim();

        if (text) {
          return {
            text,
            provider: 'gemini',
            model: modelName,
          };
        }
      } catch (err) {
        console.warn(`[Gemini] ${modelName} failed:`, err.message);
      }
    }
  }

  throw new Error('All AI providers failed (Groq + Gemini)');
}

/**
 * Specialized: Generate personalized meal plan
 */
async function generateMealPlan(userProfile) {
  const systemPrompt = `You are a practical sports nutritionist working with House of Strength GYM in the Philippines.
Create realistic, affordable, and delicious meal plans using common Filipino ingredients and carinderia-friendly options.
Strongly prefer local foods that are easy to find in wet markets, carinderias, and ordinary Filipino kitchens.
Avoid expensive imported items. Always strictly respect allergen constraints.
Return ONLY valid JSON.`;

  const prompt = `
Create a full-day meal plan (Breakfast, Lunch, Dinner + 2 Snacks) for this House of Strength member:

${JSON.stringify(userProfile, null, 2)}

Strict Rules:
- Use mostly common Filipino foods (examples: chicken adobo, pork sinigang, grilled tilapia or bangus, eggs, rice, sweet potato, banana, mongo, tofu, kangkong, pechay, sitaw, boiled egg, tuna (if no seafood allergy), chicken breast, lean pork, etc.)
- Prefer carinderia-friendly or easy home-cooked meals
- Keep it affordable for average Filipino gym-goers
- Completely exclude any allergens listed
- Match the target calories and macros as closely as possible
- Use realistic local portion sizes (e.g. 1 cup rice, 1 piece chicken, etc.)

Return in this exact JSON structure:

{
  "dailySummary": {
    "targetCalories": number,
    "actualCalories": number,
    "protein_g": number,
    "carbs_g": number,
    "fat_g": number
  },
  "meals": [
    {
      "name": "Breakfast",
      "time": "07:00",
      "items": ["item with portion", "item with portion"],
      "calories": number,
      "protein_g": number,
      "carbs_g": number,
      "fat_g": number,
      "notes": "optional practical tip"
    }
  ],
  "tips": ["practical tip 1", "practical tip 2"]
}
`;

  const result = await generateWithAI(prompt, systemPrompt, {
    temperature: 0.35,
    maxTokens: 2800,
  });

  let jsonText = result.text;
  const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
  if (jsonMatch) jsonText = jsonMatch[0];

  try {
    const plan = JSON.parse(jsonText);
    return {
      ...plan,
      meta: {
        provider: result.provider,
        model: result.model,
      },
    };
  } catch (e) {
    return {
      raw: result.text,
      meta: {
        provider: result.provider,
        model: result.model,
        parseError: true,
      },
    };
  }
}

/**
 * Specialized: Generate workout recommendation
 */
async function generateWorkoutPlan(userProfile) {
  const systemPrompt = `You are an experienced strength & conditioning coach.
Create progressive, injury-aware workout plans.
Focus on proper form cues and progressive overload.
Return ONLY valid JSON.`;

  const prompt = `
Create a workout plan for this user:

${JSON.stringify(userProfile, null, 2)}

Return in this exact JSON structure:

{
  "focus": "e.g. Hypertrophy / Strength / Fat Loss",
  "daysPerWeek": number,
  "sessionDurationMinutes": number,
  "workouts": [
    {
      "day": "Day 1 - Push",
      "exercises": [
        {
          "name": "Barbell Bench Press",
          "sets": 4,
          "reps": "6-8",
          "restSeconds": 120,
          "formCues": ["cue 1", "cue 2"],
          "notes": "optional"
        }
      ]
    }
  ],
  "progressionNotes": "how to progress next week",
  "warmup": ["..."],
  "cooldown": ["..."]
}
`;

  const result = await generateWithAI(prompt, systemPrompt, {
    temperature: 0.35,
    maxTokens: 2500,
  });

  let jsonText = result.text;
  const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
  if (jsonMatch) jsonText = jsonMatch[0];

  try {
    const plan = JSON.parse(jsonText);
    return {
      ...plan,
      meta: {
        provider: result.provider,
        model: result.model,
      },
    };
  } catch (e) {
    return {
      raw: result.text,
      meta: {
        provider: result.provider,
        model: result.model,
        parseError: true,
      },
    };
  }
}

module.exports = {
  generateWithAI,
  generateMealPlan,
  generateWorkoutPlan,
};