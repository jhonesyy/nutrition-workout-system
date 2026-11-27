const {
  generateMealPlan,
  generateWorkoutPlan,
} = require('../../services/aiRecommendationService');
const userService = require('../users/user.service');
const pool = require('../../config/db');
const aiOrchestrator = require('../../services/aiOrchestrator');
const { 
  saveConversation, 
  getConversationHistory, 
  generateConversationId 
} = require('../../services/aiChatService');

// ======================
// Helper: Build clean profile for AI
// ======================
function buildUserProfile(profile, calculations = null) {
  const calc = calculations?.calculations || {};
  const macros = calculations?.macros || {};
  return {
    age: profile.age,
    gender: profile.sex,
    heightCm: profile.height_cm,
    weightKg: profile.weight_kg,
    activityLevel: profile.activity_factor,
    goal: profile.goal_type || 'Recomposition',
    goalCategory: profile.goal_category,
    tdee: calc.tdee || null,
    bmr: calc.bmr || null,
    targetCalories: calc.target_calories || calc.tdee || null,
    protein_g: macros.protein_g || null,
    carbs_g: macros.carbs_g || null,
    fat_g: macros.fat_g || null,
    allergens: profile.allergens || [],
    experienceLevel: 'intermediate',
    availableEquipment: ['barbell', 'dumbbells', 'cable machine', 'bodyweight', 'machines'],
    preferredSplit: 'Push Pull Legs',
    daysPerWeek: 4,
    preferredCuisine: 'Filipino + International',
    gym: 'House of Strength GYM',
  };
}

// ======================
// POST /api/ai/meal-plan (EXISTING - PRESERVED)
// ======================
exports.generateMealPlan = async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId || req.user.user_id;
    const profile = await userService.getProfile(userId);
    if (!profile) return res.status(404).json({ success: false, message: 'User profile not found' });

    let calculations = null;
    try { calculations = await userService.calculateTDEE(userId); } catch (err) { console.warn('TDEE calculation failed:', err.message); }

    const userProfile = buildUserProfile(profile, calculations);
    const overrides = req.body || {};
    const finalProfile = { ...userProfile, ...overrides };

    if (!finalProfile.targetCalories && !finalProfile.tdee) {
      return res.status(400).json({ success: false, message: 'Incomplete profile. Please update age, sex, height, weight, and activity level first.' });
    }

    const plan = await generateMealPlan(finalProfile);

    try {
      await pool.query(
        `INSERT INTO generated_meal_plans (user_id, goal_type, goal_category, target_calories, protein_g, carbs_g, fat_g, allergens, plan_data, is_public)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [userId, finalProfile.goal || null, finalProfile.goalCategory || null, plan.dailySummary?.targetCalories || finalProfile.targetCalories || null, plan.dailySummary?.protein_g || finalProfile.protein_g || null, plan.dailySummary?.carbs_g || finalProfile.carbs_g || null, plan.dailySummary?.fat_g || finalProfile.fat_g || null, finalProfile.allergens || [], JSON.stringify(plan), false]
      );
    } catch (saveError) { console.error('Failed to save meal plan:', saveError.message); }

    res.json({ success: true, data: plan });
  } catch (error) {
    console.error('AI Meal Plan Error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to generate meal plan', error: error.message });
  }
};

// ======================
// POST /api/ai/workout-plan (EXISTING - PRESERVED)
// ======================
exports.generateWorkoutPlan = async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId || req.user.user_id;
    const profile = await userService.getProfile(userId);
    if (!profile) return res.status(404).json({ success: false, message: 'User profile not found' });

    let calculations = null;
    try { calculations = await userService.calculateTDEE(userId); } catch (err) { console.warn('TDEE calculation failed:', err.message); }

    const userProfile = buildUserProfile(profile, calculations);
    const overrides = req.body || {};
    const finalProfile = { ...userProfile, ...overrides };

    const plan = await generateWorkoutPlan(finalProfile);
    res.json({ success: true, data: plan });
  } catch (error) {
    console.error('AI Workout Plan Error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to generate workout plan', error: error.message });
  }
};

// ======================
// POST /api/ai/chat (UPDATED FOR MULTI-AI + FULL PROFILE)
// ======================
exports.chatWithAI = async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId || req.user.user_id;
    const { message, conversation_id: providedConvId, provider } = req.body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'Message is required' });
    }

    const conversationId = providedConvId || generateConversationId();

    // 1. Get User Context (full profile so the personal AI knows the member)
    let userContext = { userId };
    try {
      const profile = await userService.getProfile(userId);
      if (profile) {
        let calculations = null;
        try { calculations = await userService.calculateTDEE(userId); } catch (_) {}
        const calc = calculations?.calculations || {};
        const macros = calculations?.macros || {};
        userContext = {
          ...userContext,
          fullName: profile.full_name || null,
          age: profile.age ?? null,
          gender: profile.sex ?? null,
          heightCm: profile.height_cm ?? null,
          weightKg: profile.weight_kg ?? null,
          activityLevel: profile.activity_factor ?? null,
          goal: profile.goal_type || 'general fitness',
          goalCategory: profile.goal_category || null,
          allergens: profile.allergens || [],
          experienceLevel: 'intermediate',
          tdee: calc.tdee ?? null,
          bmr: calc.bmr ?? null,
          targetCalories: calc.target_calories ?? calc.tdee ?? null,
          protein_g: macros.protein_g ?? null,
          carbs_g: macros.carbs_g ?? null,
          fat_g: macros.fat_g ?? null,
        };
      }
    } catch (err) {
      console.warn('Failed to fetch user profile for AI context:', err.message);
    }

    // 2. Get recent history
    const history = await getConversationHistory(userId, conversationId, 6);
    const formattedHistory = history.map(row => ({ role: row.role, content: row.message }));

    // 3. Save user message
    await saveConversation(userId, conversationId, 'user', message.trim());

    // 4. Route to the correct AI provider via Orchestrator
    const aiResult = await aiOrchestrator.routeAIRequest(provider, message.trim(), formattedHistory, userContext);

    if (!aiResult.success) {
      throw new Error(aiResult.error || 'AI failed to generate a response');
    }

    // 5. Save AI response
    await saveConversation(userId, conversationId, 'assistant', aiResult.response, { 
      model: aiResult.model, 
      provider: aiResult.provider,
      responseTimeMs: aiResult.responseTimeMs
    });

    res.json({
      success: true,
      conversation_id: conversationId,
      response: aiResult.response,
      model: aiResult.model,
      provider: aiResult.provider
    });

  } catch (error) {
    console.error('AI Chat Error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to get AI response', error: error.message });
  }
};

// ======================
// GET /api/ai/history/:conversation_id (EXISTING - PRESERVED)
// ======================
exports.getHistory = async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId || req.user.user_id;
    const { conversation_id } = req.params;
    const history = await getConversationHistory(userId, conversation_id, 50);
    res.json({ success: true, data: history });
  } catch (error) {
    console.error('Get History Error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to retrieve history' });
  }
};

// ======================
// POST /api/ai/compare (NEW: MULTI-AI COMPARISON)
// ======================
exports.compareAI = async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId || req.user.user_id;
    const { message, conversation_id: providedConvId } = req.body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'Message is required' });
    }

    const conversationId = providedConvId || generateConversationId();

    let userContext = { userId };
    try {
      const profile = await userService.getProfile(userId);
      if (profile) {
        let calculations = null;
        try { calculations = await userService.calculateTDEE(userId); } catch (_) {}
        const calc = calculations?.calculations || {};
        const macros = calculations?.macros || {};
        userContext = {
          ...userContext,
          fullName: profile.full_name || null,
          age: profile.age ?? null,
          gender: profile.sex ?? null,
          heightCm: profile.height_cm ?? null,
          weightKg: profile.weight_kg ?? null,
          activityLevel: profile.activity_factor ?? null,
          goal: profile.goal_type || 'general fitness',
          goalCategory: profile.goal_category || null,
          allergens: profile.allergens || [],
          experienceLevel: 'intermediate',
          tdee: calc.tdee ?? null,
          bmr: calc.bmr ?? null,
          targetCalories: calc.target_calories ?? calc.tdee ?? null,
          protein_g: macros.protein_g ?? null,
          carbs_g: macros.carbs_g ?? null,
          fat_g: macros.fat_g ?? null,
        };
      }
    } catch (err) { console.warn('Failed to fetch user profile:', err.message); }

    const history = await getConversationHistory(userId, conversationId, 4);
    const formattedHistory = history.map(row => ({ role: row.role, content: row.message }));

    const results = await aiOrchestrator.compareProviders(message.trim(), formattedHistory, userContext);

    const primaryResult = results.find(r => r.success);
    if (primaryResult) {
      await saveConversation(userId, conversationId, 'user', message.trim());
      await saveConversation(userId, conversationId, 'assistant', primaryResult.response, { 
        model: primaryResult.model, 
        provider: primaryResult.provider,
        isComparison: true 
      });
    }

    res.json({
      success: true,
      conversation_id: conversationId,
      results: results
    });

  } catch (error) {
    console.error('AI Compare Error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to compare AI providers', error: error.message });
  }
};

// ======================
// GET /api/ai/admin/metrics (NEW: ADMIN ONLY)
// ======================
exports.getAIMetrics = async (req, res) => {
  try {
    const metrics = await aiOrchestrator.getMetrics();
    res.json({ success: true, data: metrics });
  } catch (error) {
    console.error('Get AI Metrics Error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to retrieve AI metrics' });
  }
};

// ======================
// POST /api/ai/admin/config (NEW: ADMIN ONLY)
// ======================
exports.updateAIConfig = async (req, res) => {
  try {
    const { default_provider, enabled_providers } = req.body;
    
    const validProviders = ['custom', 'groq', 'gemini'];
    if (default_provider && !validProviders.includes(default_provider)) {
      return res.status(400).json({ success: false, message: 'Invalid default provider' });
    }

    if (enabled_providers) {
      if (!Array.isArray(enabled_providers)) {
        return res.status(400).json({ success: false, message: 'enabled_providers must be an array' });
      }
      const invalid = enabled_providers.filter(p => !validProviders.includes(p));
      if (invalid.length > 0) {
        return res.status(400).json({ success: false, message: `Invalid providers: ${invalid.join(', ')}` });
      }
    }

    await aiOrchestrator.updateConfig(
      default_provider || 'custom', 
      enabled_providers ? enabled_providers.join(',') : 'custom,groq,gemini'
    );

    res.json({ success: true, message: 'AI configuration updated successfully' });
  } catch (error) {
    console.error('Update AI Config Error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to update AI configuration' });
  }
};