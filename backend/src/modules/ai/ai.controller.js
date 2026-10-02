const {
  generateMealPlan,
  generateWorkoutPlan,
} = require('../../services/aiRecommendationService');

const userService = require('../users/user.service');
const pool = require('../../config/db');

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
// POST /api/ai/meal-plan
// ======================
exports.generateMealPlan = async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId || req.user.user_id;

    const profile = await userService.getProfile(userId);
    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'User profile not found',
      });
    }

    let calculations = null;
    try {
      calculations = await userService.calculateTDEE(userId);
    } catch (err) {
      console.warn('TDEE calculation failed:', err.message);
    }

    const userProfile = buildUserProfile(profile, calculations);
    const overrides = req.body || {};
    const finalProfile = { ...userProfile, ...overrides };

    if (!finalProfile.targetCalories && !finalProfile.tdee) {
      return res.status(400).json({
        success: false,
        message: 'Incomplete profile. Please update age, sex, height, weight, and activity level first.',
      });
    }

    // Generate the plan
    const plan = await generateMealPlan(finalProfile);

    // ===== SAVE TO DATABASE =====
    try {
      await pool.query(
        `INSERT INTO generated_meal_plans 
          (user_id, goal_type, goal_category, target_calories, protein_g, carbs_g, fat_g, allergens, plan_data, is_public)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          userId,
          finalProfile.goal || null,
          finalProfile.goalCategory || null,
          plan.dailySummary?.targetCalories || finalProfile.targetCalories || null,
          plan.dailySummary?.protein_g || finalProfile.protein_g || null,
          plan.dailySummary?.carbs_g || finalProfile.carbs_g || null,
          plan.dailySummary?.fat_g || finalProfile.fat_g || null,
          finalProfile.allergens || [],
          JSON.stringify(plan),
          false, // is_public - set to true later if you want to share
        ]
      );
      console.log('Meal plan saved to database');
    } catch (saveError) {
      console.error('Failed to save meal plan:', saveError.message);
      // Don't fail the request if saving fails
    }

    res.json({
      success: true,
      data: plan,
    });
  } catch (error) {
    console.error('AI Meal Plan Error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to generate meal plan',
      error: error.message,
    });
  }
};

// ======================
// POST /api/ai/workout-plan
// ======================
exports.generateWorkoutPlan = async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId || req.user.user_id;

    const profile = await userService.getProfile(userId);
    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'User profile not found',
      });
    }

    let calculations = null;
    try {
      calculations = await userService.calculateTDEE(userId);
    } catch (err) {
      console.warn('TDEE calculation failed:', err.message);
    }

    const userProfile = buildUserProfile(profile, calculations);
    const overrides = req.body || {};
    const finalProfile = { ...userProfile, ...overrides };

    const plan = await generateWorkoutPlan(finalProfile);

    res.json({
      success: true,
      data: plan,
    });
  } catch (error) {
    console.error('AI Workout Plan Error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to generate workout plan',
      error: error.message,
    });
  }
};