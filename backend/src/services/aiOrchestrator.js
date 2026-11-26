const axios = require('axios');
const pool = require('../config/db');
const Groq = require('groq-sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// ============================================================
// AI CLIENT INITIALIZATION
// ============================================================
const groq = process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;
const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;

// Prefer IPv4 to avoid ::1 / ECONNREFUSED issues
const PYTHON_AI_API_URL = (process.env.PYTHON_AI_API_URL || process.env.CUSTOM_AI_URL || 'http://127.0.0.1:8000').replace('localhost', '127.0.0.1');
const GROQ_MODEL = process.env.GROQ_MODEL || 'qwen/qwen3.8-27b';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const DEFAULT_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS) || 30000;

// ============================================================
// HELPER: Track Metrics
// ============================================================
async function trackMetrics(provider, responseTimeMs, isSuccess) {
  try {
    await pool.query(
      `INSERT INTO ai_provider_metrics (provider, request_count, error_count, total_response_time_ms, last_updated)
       VALUES ($1, 1, $2, $3, CURRENT_TIMESTAMP)
       ON CONFLICT (provider) 
       DO UPDATE SET 
         request_count = ai_provider_metrics.request_count + 1,
         error_count = ai_provider_metrics.error_count + $2,
         total_response_time_ms = ai_provider_metrics.total_response_time_ms + $3,
         last_updated = CURRENT_TIMESTAMP`,
      [provider, isSuccess ? 0 : 1, responseTimeMs]
    );
  } catch (err) {
    console.error(`[Metrics] Failed to track ${provider}:`, err.message);
  }
}

// ============================================================
// HELPER: Get Config
// ============================================================
async function getConfig() {
  try {
    const result = await pool.query(`SELECT config_key, config_value FROM ai_config`);
    const config = {};
    result.rows.forEach(row => { config[row.config_key] = row.config_value; });
    return config;
  } catch (err) {
    return { default_provider: 'custom', enabled_providers: 'custom,groq,gemini' };
  }
}

// ============================================================
// PERSONA SYSTEM PROMPT (member profile injected)
// ============================================================
function buildPersonaSystemPrompt(userContext = {}) {
  const ctx = userContext || {};
  const lines = [
    'You are the personal AI nutrition and workout assistant for this gym member (House of Strength GYM).',
    'Speak as their coach who already knows their profile. Use the MEMBER PROFILE below when they ask about age, weight, height, goals, calories, allergens, etc.',
    'Do not say you do not know their age/weight/goal if that value is present in the profile. Do not invent missing values.',
    'Give safe, practical, concise advice. If a medical question is outside fitness/nutrition scope, recommend a professional.',
    '',
    'MEMBER PROFILE (source of truth for this chat):',
    `- Age: ${ctx.age != null ? ctx.age : 'not set'}`,
    `- Gender/sex: ${ctx.gender || 'not set'}`,
    `- Height (cm): ${ctx.heightCm != null ? ctx.heightCm : 'not set'}`,
    `- Weight (kg): ${ctx.weightKg != null ? ctx.weightKg : 'not set'}`,
    `- Activity level: ${ctx.activityLevel || 'not set'}`,
    `- Goal: ${ctx.goal || 'not set'}`,
    `- Goal category: ${ctx.goalCategory || 'not set'}`,
    `- Allergens: ${Array.isArray(ctx.allergens) && ctx.allergens.length ? ctx.allergens.join(', ') : (ctx.allergens || 'none listed')}`,
    `- Experience: ${ctx.experienceLevel || 'not set'}`,
    `- BMR: ${ctx.bmr != null ? ctx.bmr : 'not calculated'}`,
    `- TDEE: ${ctx.tdee != null ? ctx.tdee : 'not calculated'}`,
    `- Target calories: ${ctx.targetCalories != null ? ctx.targetCalories : 'not calculated'}`,
    `- Protein (g): ${ctx.protein_g != null ? ctx.protein_g : 'not set'}`,
    `- Carbs (g): ${ctx.carbs_g != null ? ctx.carbs_g : 'not set'}`,
    `- Fat (g): ${ctx.fat_g != null ? ctx.fat_g : 'not set'}`,
  ];
  return lines.join('\n');
}

// ============================================================
// 1. CUSTOM AI EXECUTION
// ============================================================
async function executeCustomAI(message, history, userContext) {
  const startTime = Date.now();
  try {
    const response = await axios.post(
      `${PYTHON_AI_API_URL}/api/ai/chat`,
      {
        message,
        user_id: String(userContext.userId || userContext.user_id || '1'),
        conversation_history: history || [],
        user_context: userContext || {}
      },
      { timeout: DEFAULT_TIMEOUT_MS }
    );

    const responseTime = Date.now() - startTime;
    const ok = !!(response.data && (response.data.success !== false) && response.data.response);
    await trackMetrics('custom', responseTime, ok);

    if (!ok) {
      return { provider: 'custom', success: false, error: response.data?.error || 'Custom AI returned empty response' };
    }

    return {
      provider: 'custom',
      response: response.data.response,
      model: response.data.model_name || 'nutrition-workout-ai-lora',
      responseTimeMs: responseTime,
      success: true
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    await trackMetrics('custom', responseTime, false);
    const reason = error.code === 'ECONNREFUSED'
      ? `Custom AI unreachable at ${PYTHON_AI_API_URL} (is the FastAPI service running?)`
      : (error.message || 'Custom AI request failed');
    console.error(`[Custom AI Error]: ${reason}`);
    return { provider: 'custom', success: false, error: reason };
  }
}

// ============================================================
// 2. GROQ EXECUTION
// ============================================================
async function executeGroq(message, history, userContext) {
  const startTime = Date.now();
  if (!groq) return { provider: 'groq', success: false, error: 'Groq API key not configured.' };

  try {
    const systemPrompt = buildPersonaSystemPrompt(userContext);
    const messages = [
      { role: 'system', content: systemPrompt },
      ...(history || []).map(h => ({ role: h.role === 'user' ? 'user' : 'assistant', content: h.content })),
      { role: 'user', content: message }
    ];

    const completion = await groq.chat.completions.create({
      model: GROQ_MODEL,
      messages,
      temperature: 0.7,
      max_tokens: 1024,
    });

    const responseTime = Date.now() - startTime;
    const text = completion.choices?.[0]?.message?.content?.trim();
    await trackMetrics('groq', responseTime, !!text);

    if (!text) {
      return { provider: 'groq', success: false, error: 'Groq returned an empty response.' };
    }

    return {
      provider: 'groq',
      response: text,
      model: completion.model || GROQ_MODEL,
      responseTimeMs: responseTime,
      success: true
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    await trackMetrics('groq', responseTime, false);
    const msg = error?.error?.message || error.message || 'Groq API request failed';
    console.error(`[Groq Error]: ${msg}`);
    return { provider: 'groq', success: false, error: msg };
  }
}

// ============================================================
// 3. GEMINI EXECUTION
// ============================================================
async function executeGemini(message, history, userContext) {
  const startTime = Date.now();
  if (!genAI) return { provider: 'gemini', success: false, error: 'Gemini API key not configured.' };

  try {
    const systemPrompt = buildPersonaSystemPrompt(userContext);
    const model = genAI.getGenerativeModel({
      model: GEMINI_MODEL,
      systemInstruction: systemPrompt,
    });
    const chat = model.startChat({
      history: (history || []).map(h => ({
        role: h.role === 'user' ? 'user' : 'model',
        parts: [{ text: h.content }]
      })),
      generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
    });

    const result = await chat.sendMessage(message);
    const text = result.response.text()?.trim();
    const responseTime = Date.now() - startTime;
    await trackMetrics('gemini', responseTime, !!text);

    if (!text) {
      return { provider: 'gemini', success: false, error: 'Gemini returned an empty response.' };
    }

    return {
      provider: 'gemini',
      response: text,
      model: GEMINI_MODEL,
      responseTimeMs: responseTime,
      success: true
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    await trackMetrics('gemini', responseTime, false);
    const msg = error.message || 'Gemini API request failed';
    console.error(`[Gemini Error]: ${msg}`);
    return { provider: 'gemini', success: false, error: msg };
  }
}

// ============================================================
// MAIN ROUTER WITH AUTOMATIC FALLBACK
// ============================================================
async function routeAIRequest(requestedProvider, message, history, userContext) {
  const config = await getConfig();
  const enabledProviders = (config.enabled_providers || 'custom,groq,gemini')
    .split(',')
    .map(p => p.trim())
    .filter(Boolean);
  const defaultProvider = config.default_provider || 'custom';

  let targetProvider = requestedProvider;
  if (!targetProvider || !enabledProviders.includes(targetProvider)) {
    targetProvider = defaultProvider;
  }

  const providersToTry = [targetProvider, ...enabledProviders.filter(p => p !== targetProvider)];

  console.log(`[AI] Trying providers in order: ${providersToTry.join(' → ')}`);

  for (const provider of providersToTry) {
    try {
      let result;
      switch (provider) {
        case 'custom': result = await executeCustomAI(message, history, userContext); break;
        case 'groq':   result = await executeGroq(message, history, userContext); break;
        case 'gemini': result = await executeGemini(message, history, userContext); break;
        default:
          console.warn(`[AI Fallback] Unknown provider "${provider}", skipping`);
          continue;
      }

      if (result && result.success) {
        console.log(`[AI] Success with provider: ${provider} (${result.model})`);
        return result;
      }

      console.warn(`[AI Fallback] ${provider} failed (${result?.error || 'unknown'}). Trying next…`);
    } catch (err) {
      console.warn(`[AI Fallback] ${provider} threw:`, err.message);
    }
  }

  return {
    success: false,
    error: 'All AI providers are currently unavailable. Please try again later.'
  };
}

// ============================================================
// MULTI-AI COMPARISON
// ============================================================
async function compareProviders(message, history, userContext) {
  const config = await getConfig();
  const enabledProviders = (config.enabled_providers || 'custom,groq,gemini').split(',').map(p => p.trim());

  const promises = [];
  if (enabledProviders.includes('custom')) promises.push(executeCustomAI(message, history, userContext));
  if (enabledProviders.includes('groq'))   promises.push(executeGroq(message, history, userContext));
  if (enabledProviders.includes('gemini')) promises.push(executeGemini(message, history, userContext));

  const results = await Promise.allSettled(promises);
  return results.map((r) =>
    r.status === 'fulfilled' ? r.value : { provider: 'unknown', success: false, error: r.reason?.message || 'Unknown error' }
  );
}

// ============================================================
// ADMIN METRICS & CONFIG
// ============================================================
async function getMetrics() {
  const result = await pool.query(`SELECT * FROM ai_provider_metrics ORDER BY provider`);
  return result.rows.map(row => ({
    ...row,
    error_rate: row.request_count > 0 ? ((row.error_count / row.request_count) * 100).toFixed(2) + '%' : '0%',
    avg_response_time_ms: row.request_count > 0 ? Math.round(row.total_response_time_ms / row.request_count) : 0
  }));
}

async function updateConfig(newDefaultProvider, newEnabledProviders) {
  await pool.query(
    `INSERT INTO ai_config (config_key, config_value) VALUES ('default_provider', $1), ('enabled_providers', $2)
     ON CONFLICT (config_key) DO UPDATE SET config_value = EXCLUDED.config_value, updated_at = CURRENT_TIMESTAMP`,
    [newDefaultProvider, newEnabledProviders]
  );
  return true;
}

module.exports = {
  routeAIRequest,
  compareProviders,
  getMetrics,
  updateConfig
};