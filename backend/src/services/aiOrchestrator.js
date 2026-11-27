
const axios = require('axios');
const pool = require('../config/db');
const Groq = require('groq-sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// ============================================================
// AI CLIENT INITIALIZATION
// ============================================================

const groq = process.env.GROQ_API_KEY
  ? new Groq({ apiKey: process.env.GROQ_API_KEY })
  : null;

const genAI = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;

const PYTHON_AI_API_URL = (
  process.env.PYTHON_AI_API_URL ||
  process.env.CUSTOM_AI_URL ||
  'http://127.0.0.1:8000'
).replace('localhost', '127.0.0.1');

const GROQ_MODEL =
  process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

const GEMINI_MODEL =
  process.env.GEMINI_MODEL || 'gemini-2.5-flash';

const DEFAULT_TIMEOUT_MS =
  Number(process.env.AI_TIMEOUT_MS) || 30000;

// ============================================================
// PROVIDER CONFIGURATION
// ============================================================

const VALID_PROVIDERS = ['groq', 'gemini', 'custom'];

const DEFAULT_ENABLED_PROVIDERS = ['groq', 'gemini', 'custom'];

// ============================================================
// METRICS
// ============================================================

async function trackMetrics(provider, responseTimeMs, isSuccess) {
  try {
    await pool.query(
      `INSERT INTO ai_provider_metrics
        (provider, request_count, error_count, total_response_time_ms, last_updated)
       VALUES ($1, 1, $2, $3, CURRENT_TIMESTAMP)
       ON CONFLICT (provider)
       DO UPDATE SET
         request_count = ai_provider_metrics.request_count + 1,
         error_count = ai_provider_metrics.error_count + $2,
         total_response_time_ms =
           ai_provider_metrics.total_response_time_ms + $3,
         last_updated = CURRENT_TIMESTAMP`,
      [provider, isSuccess ? 0 : 1, responseTimeMs]
    );
  } catch (error) {
    console.error(
      `[Metrics] Failed to track ${provider}:`,
      error.message
    );
  }
}

// ============================================================
// DATABASE CONFIGURATION
// ============================================================

async function getConfig() {
  try {
    const result = await pool.query(
      'SELECT config_key, config_value FROM ai_config'
    );

    const config = {};

    for (const row of result.rows) {
      config[row.config_key] = row.config_value;
    }

    return config;
  } catch (error) {
    console.error('[AI Config] Database config unavailable:', error.message);

    return {
      default_provider: 'groq',
      enabled_providers: 'groq,gemini,custom'
    };
  }
}

function parseEnabledProviders(config) {
  const raw = config.enabled_providers || 'groq,gemini,custom';

  const providers = raw
    .split(',')
    .map(provider => provider.trim().toLowerCase())
    .filter(provider => VALID_PROVIDERS.includes(provider));

  return [...new Set(providers)];
}

// ============================================================
// PERSONA SYSTEM PROMPT
// ============================================================

function buildPersonaSystemPrompt(userContext = {}) {
  const ctx = userContext || {};

  return [
    'You are the personal AI nutrition and workout assistant for House of Strength GYM.',
    'You are a knowledgeable, friendly, practical fitness coach.',
    '',
    'COACH IAN LIVE MESSENGER SUPPORT:',
    '- Members can contact Coach Ian through the NutriFit website.',
    '- The website has a floating button labeled "Chat with Coach Ian" at the bottom-right.',
    '- Clicking it opens Coach Ian Messenger directly: https://m.me/ian.gabriel.lorenzo.2024',
    '- When a member asks for human assistance, personal coaching, or wants to speak with Coach Ian, direct them to click that website button.',
    '- If they are not using the website, share this Messenger link: https://m.me/ian.gabriel.lorenzo.2024',
    '- Explain that Messenger opens separately from the website chat.',
    '- Never claim you sent a message, contacted Coach Ian, or transferred the conversation automatically.',
    '- You are the AI assistant. Do not pretend to be Coach Ian himself.',
    '',
    'GENERAL BEHAVIOR:',
    '- Answer the exact question asked.',
    '- Respond naturally to greetings and casual conversation.',
    '- Explain fitness terms in simple language when requested.',
    '- Do not turn unrelated questions into nutrition or food questions.',
    '- Never invent user profile information.',
    '- Do not fabricate food names, nutritional values, studies, or references.',
    '- Keep answers clear, useful, and concise.',
    '- Use bullet points when they improve readability.',
    '- Give safe, practical fitness and nutrition advice.',
    '- Recommend a qualified healthcare professional for medical concerns.',
    '',
    'MEMBER PROFILE:',
    `Member name: ${ctx.fullName || 'not available'}`,
    '- You know the member name shown above.',
    '- When asked for their name, answer using that exact name.',
    '- Never claim you do not know their name when it is provided.',
    `Age: ${ctx.age ?? 'not set'}`,
    `Gender/sex: ${ctx.gender || 'not set'}`,
    `Height (cm): ${ctx.heightCm ?? 'not set'}`,
    `Weight (kg): ${ctx.weightKg ?? 'not set'}`,
    `Activity level: ${ctx.activityLevel || 'not set'}`,
    `Goal: ${ctx.goal || 'not set'}`,
    `Goal category: ${ctx.goalCategory || 'not set'}`,
    `Allergens: ${
      Array.isArray(ctx.allergens)
        ? ctx.allergens.join(', ') || 'none listed'
        : ctx.allergens || 'none listed'
    }`,
    `Experience: ${ctx.experienceLevel || 'not set'}`,
    `BMR: ${ctx.bmr ?? 'not calculated'}`,
    `TDEE: ${ctx.tdee ?? 'not calculated'}`,
    `Target calories: ${ctx.targetCalories ?? 'not calculated'}`,
    `Protein (g): ${ctx.protein_g ?? 'not set'}`,
    `Carbs (g): ${ctx.carbs_g ?? 'not set'}`,
    `Fat (g): ${ctx.fat_g ?? 'not set'}`,
    '',
    'Use profile information only when relevant to the question.'
  ].join('\n');
}

// ============================================================
// RESPONSE VALIDATION
// ============================================================

function validateResponse(response) {
  if (typeof response !== 'string') {
    return {
      valid: false,
      reason: 'Response is not text.'
    };
  }

  const text = response.trim();

  if (!text || text.length < 2) {
    return {
      valid: false,
      reason: 'Response is empty or too short.'
    };
  }

  if (text.length > 12000) {
    return {
      valid: false,
      reason: 'Response is excessively long.'
    };
  }

  const words = text.toLowerCase().match(/\b[a-z]+\b/g) || [];

  if (words.length >= 15 && new Set(words).size <= 4) {
    return {
      valid: false,
      reason: 'Response contains excessive repetition.'
    };
  }

  const suspiciousPatterns = [
    /has \d+\.?\d* calories per \d+g/i,
    /contains \d+\.?\d* calories per \d+g/i,
    /protein source that targets the various muscles/i,
    /provides support for building strength and other effective exercise devices/i
  ];

  if (suspiciousPatterns.some(pattern => pattern.test(text))) {
    return {
      valid: false,
      reason: 'Response contains suspicious generated content.'
    };
  }

  return {
    valid: true,
    response: text
  };
}

// ============================================================
// CUSTOM MODEL RELEVANCE CHECK
// ============================================================

function validateCustomRelevance(message, response) {
  const question = String(message || '').toLowerCase();
  const answer = String(response || '').toLowerCase();

  const greetingPattern =
    /^(hi|hello|hey|yo|good morning|good afternoon|good evening)[!.?\s]*$/i;

  if (greetingPattern.test(question.trim())) {
    const greetingWords = [
      'hello',
      'hi',
      'hey',
      'welcome',
      'good morning',
      'good afternoon',
      'good evening'
    ];

    if (!greetingWords.some(word => answer.includes(word))) {
      return {
        valid: false,
        reason: 'Custom model failed to respond appropriately to greeting.'
      };
    }
  }

  if (/\bdoms\b|delayed onset muscle soreness/i.test(question)) {
    const relevantTerms = [
      'delayed onset',
      'muscle soreness',
      'soreness',
      'after exercise',
      'after workout',
      'muscle pain',
      'recovery'
    ];

    if (!relevantTerms.some(term => answer.includes(term))) {
      return {
        valid: false,
        reason: 'Custom model response is unrelated to DOMS.'
      };
    }
  }

  if (/progressive overload/i.test(question)) {
    const relevantTerms = [
      'gradual',
      'gradually',
      'increase',
      'increasing',
      'weight',
      'reps',
      'sets',
      'resistance',
      'training load',
      'workload'
    ];

    if (!relevantTerms.some(term => answer.includes(term))) {
      return {
        valid: false,
        reason: 'Custom model response is unrelated to progressive overload.'
      };
    }
  }

  return {
    valid: true
  };
}

// ============================================================
// HISTORY NORMALIZATION
// ============================================================

function normalizeHistory(history) {
  if (!Array.isArray(history)) {
    return [];
  }

  return history
    .filter(item =>
      item &&
      typeof item.content === 'string' &&
      item.content.trim()
    )
    .slice(-10)
    .map(item => ({
      role: item.role === 'user' ? 'user' : 'assistant',
      content: item.content.trim().slice(0, 5000)
    }));
}

// ============================================================
// 1. CUSTOM AI
// ============================================================

async function executeCustomAI(message, history, userContext = {}) {
  const startTime = Date.now();

  try {
    const response = await axios.post(
      `${PYTHON_AI_API_URL}/api/ai/chat`,
      {
        message,
        user_id: String(
          userContext.userId ||
          userContext.user_id ||
          '1'
        ),
        conversation_history: normalizeHistory(history),
        user_context: userContext
      },
      {
        timeout: DEFAULT_TIMEOUT_MS
      }
    );

    const responseTime = Date.now() - startTime;

    const rawText = response.data?.response;

    if (
      response.data?.success === false ||
      typeof rawText !== 'string' ||
      !rawText.trim()
    ) {
      await trackMetrics('custom', responseTime, false);

      return {
        provider: 'custom',
        success: false,
        error: 'Custom AI returned an empty response.'
      };
    }

    const quality = validateResponse(rawText);

    if (!quality.valid) {
      await trackMetrics('custom', responseTime, false);

      return {
        provider: 'custom',
        success: false,
        error: quality.reason
      };
    }

    const relevance = validateCustomRelevance(
      message,
      quality.response
    );

    if (!relevance.valid) {
      await trackMetrics('custom', responseTime, false);

      return {
        provider: 'custom',
        success: false,
        error: relevance.reason
      };
    }

    await trackMetrics('custom', responseTime, true);

    return {
      provider: 'custom',
      response: quality.response,
      model: response.data.model_name || 'nutrition-workout-ai-lora',
      responseTimeMs: responseTime,
      success: true
    };

  } catch (error) {
    const responseTime = Date.now() - startTime;

    await trackMetrics('custom', responseTime, false);

    const reason = error.code === 'ECONNREFUSED'
      ? `Custom AI unreachable at ${PYTHON_AI_API_URL}.`
      : error.message || 'Custom AI request failed.';

    console.error(`[Custom AI Error]: ${reason}`);

    return {
      provider: 'custom',
      success: false,
      error: reason
    };
  }
}

// ============================================================
// 2. GROQ
// ============================================================

async function executeGroq(message, history, userContext = {}) {
  const startTime = Date.now();

  if (!groq) {
    return {
      provider: 'groq',
      success: false,
      error: 'Groq API key not configured.'
    };
  }

  try {
    const messages = [
      {
        role: 'system',
        content: buildPersonaSystemPrompt(userContext)
      },
      ...normalizeHistory(history).map(item => ({
        role: item.role,
        content: item.content
      })),
      {
        role: 'user',
        content: message
      }
    ];

    const completion = await groq.chat.completions.create({
      model: GROQ_MODEL,
      messages,
      temperature: 0.5,
      max_tokens: 1024
    });

    const responseTime = Date.now() - startTime;

    const rawText =
      completion.choices?.[0]?.message?.content;

    const quality = validateResponse(rawText);

    if (!quality.valid) {
      await trackMetrics('groq', responseTime, false);

      return {
        provider: 'groq',
        success: false,
        error: quality.reason
      };
    }

    await trackMetrics('groq', responseTime, true);

    return {
      provider: 'groq',
      response: quality.response,
      model: completion.model || GROQ_MODEL,
      responseTimeMs: responseTime,
      success: true
    };

  } catch (error) {
    const responseTime = Date.now() - startTime;

    await trackMetrics('groq', responseTime, false);

    const messageText =
      error?.error?.message ||
      error.message ||
      'Groq API request failed.';

    console.error(`[Groq Error]: ${messageText}`);

    return {
      provider: 'groq',
      success: false,
      error: messageText
    };
  }
}

// ============================================================
// 3. GEMINI
// ============================================================

async function executeGemini(message, history, userContext = {}) {
  const startTime = Date.now();

  if (!genAI) {
    return {
      provider: 'gemini',
      success: false,
      error: 'Gemini API key not configured.'
    };
  }

  try {
    const model = genAI.getGenerativeModel({
      model: GEMINI_MODEL,
      systemInstruction: buildPersonaSystemPrompt(userContext)
    });

    const normalizedHistory = normalizeHistory(history);

    const chat = model.startChat({
      history: normalizedHistory.map(item => ({
        role: item.role === 'user' ? 'user' : 'model',
        parts: [{ text: item.content }]
      })),
      generationConfig: {
        temperature: 0.5,
        maxOutputTokens: 1024
      }
    });

    const result = await chat.sendMessage(message);

    const responseTime = Date.now() - startTime;

    const rawText = result.response.text()?.trim();

    const quality = validateResponse(rawText);

    if (!quality.valid) {
      await trackMetrics('gemini', responseTime, false);

      return {
        provider: 'gemini',
        success: false,
        error: quality.reason
      };
    }

    await trackMetrics('gemini', responseTime, true);

    return {
      provider: 'gemini',
      response: quality.response,
      model: GEMINI_MODEL,
      responseTimeMs: responseTime,
      success: true
    };

  } catch (error) {
    const responseTime = Date.now() - startTime;

    await trackMetrics('gemini', responseTime, false);

    console.error(`[Gemini Error]: ${error.message}`);

    return {
      provider: 'gemini',
      success: false,
      error: error.message || 'Gemini API request failed.'
    };
  }
}

// ============================================================
// PROVIDER EXECUTION
// ============================================================

async function executeProvider(provider, message, history, userContext) {
  switch (provider) {
    case 'groq':
      return executeGroq(message, history, userContext);

    case 'gemini':
      return executeGemini(message, history, userContext);

    case 'custom':
      return executeCustomAI(message, history, userContext);

    default:
      return {
        provider,
        success: false,
        error: `Unknown provider: ${provider}`
      };
  }
}

// ============================================================
// MAIN ROUTER
// ============================================================

async function routeAIRequest(
  requestedProvider,
  message,
  history,
  userContext = {}
) {
  if (typeof message !== 'string' || !message.trim()) {
    return {
      success: false,
      error: 'Message cannot be empty.'
    };
  }

  const config = await getConfig();

  const enabledProviders = parseEnabledProviders(config);

  if (enabledProviders.length === 0) {
    return {
      success: false,
      error: 'No AI providers are enabled.'
    };
  }

  const requested = String(requestedProvider || '')
    .trim()
    .toLowerCase();

  // Explicit provider selection takes priority.
  // Otherwise prefer Groq, then Gemini, then custom.
  let targetProvider;

  if (
    requested &&
    VALID_PROVIDERS.includes(requested) &&
    enabledProviders.includes(requested)
  ) {
    targetProvider = requested;
  } else {
    const configuredDefault = String(
      config.default_provider || ''
    ).trim().toLowerCase();

    // Do not allow old database setting "custom"
    // to keep the broken custom model as default.
    targetProvider =
      configuredDefault !== 'custom' &&
      enabledProviders.includes(configuredDefault)
        ? configuredDefault
        : enabledProviders.includes('groq')
          ? 'groq'
          : enabledProviders.includes('gemini')
            ? 'gemini'
            : 'custom';
  }

  const fallbackOrder = ['groq', 'gemini', 'custom'];

  const providersToTry = [
    targetProvider,
    ...fallbackOrder.filter(provider =>
      provider !== targetProvider &&
      enabledProviders.includes(provider)
    )
  ];

  console.log(
    `[AI] Provider order: ${providersToTry.join(' → ')}`
  );

  for (const provider of providersToTry) {
    const result = await executeProvider(
      provider,
      message.trim(),
      history,
      userContext
    );

    if (result?.success && result.response) {
      console.log(
        `[AI] Success: ${provider} (${result.model})`
      );

      return result;
    }

    console.warn(
      `[AI Fallback] ${provider} failed: ${
        result?.error || 'Unknown error'
      }`
    );
  }

  return {
    success: false,
    error: 'All AI providers are currently unavailable. Please try again later.'
  };
}

// ============================================================
// MULTI-AI COMPARISON
// ============================================================

async function compareProviders(message, history, userContext = {}) {
  const config = await getConfig();

  const enabledProviders = parseEnabledProviders(config);

  const results = await Promise.allSettled(
    enabledProviders.map(provider =>
      executeProvider(provider, message, history, userContext)
    )
  );

  return results.map((result, index) =>
    result.status === 'fulfilled'
      ? result.value
      : {
          provider: enabledProviders[index],
          success: false,
          error: result.reason?.message || 'Unknown error'
        }
  );
}

// ============================================================
// ADMIN METRICS
// ============================================================

async function getMetrics() {
  const result = await pool.query(
    'SELECT * FROM ai_provider_metrics ORDER BY provider'
  );

  return result.rows.map(row => ({
    ...row,

    error_rate: row.request_count > 0
      ? (
          (row.error_count / row.request_count) * 100
        ).toFixed(2) + '%'
      : '0%',

    avg_response_time_ms: row.request_count > 0
      ? Math.round(
          row.total_response_time_ms / row.request_count
        )
      : 0
  }));
}

// ============================================================
// UPDATE ADMIN CONFIG
// ============================================================

async function updateConfig(newDefaultProvider, newEnabledProviders) {
  const defaultProvider = String(
    newDefaultProvider || ''
  ).trim().toLowerCase();

  if (!VALID_PROVIDERS.includes(defaultProvider)) {
    throw new Error('Invalid default AI provider.');
  }

  const enabledProviders = Array.isArray(newEnabledProviders)
    ? newEnabledProviders
    : String(newEnabledProviders || '')
        .split(',')
        .map(provider => provider.trim().toLowerCase());

  const cleanedProviders = [
    ...new Set(
      enabledProviders.filter(provider =>
        VALID_PROVIDERS.includes(provider)
      )
    )
  ];

  if (!cleanedProviders.length) {
    throw new Error('At least one AI provider must be enabled.');
  }

  if (!cleanedProviders.includes(defaultProvider)) {
    throw new Error(
      'Default provider must be included in enabled providers.'
    );
  }

  await pool.query(
    `INSERT INTO ai_config
      (config_key, config_value)
     VALUES
      ('default_provider', $1),
      ('enabled_providers', $2)
     ON CONFLICT (config_key)
     DO UPDATE SET
       config_value = EXCLUDED.config_value,
       updated_at = CURRENT_TIMESTAMP`,
    [
      defaultProvider,
      cleanedProviders.join(',')
    ]
  );

  return true;
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  routeAIRequest,
  compareProviders,
  getMetrics,
  updateConfig
};
