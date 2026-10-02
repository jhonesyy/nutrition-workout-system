const pool = require('../../config/db');

// ======================
// LOG A MEAL
// ======================
const logMeal = async (userId, data) => {
  const { food_id, meal_type, quantity } = data;

  const foodResult = await pool.query(
    `SELECT calories, protein_g, carbs_g, fat_g FROM foods WHERE id = $1 AND is_active = true`,
    [food_id]
  );

  if (foodResult.rows.length === 0) {
    throw new Error('Food not found');
  }

  const food = foodResult.rows[0];
  const qty = parseFloat(quantity) || 1;

  const calories = parseFloat(food.calories) * qty;
  const protein_g = parseFloat(food.protein_g) * qty;
  const carbs_g = parseFloat(food.carbs_g) * qty;
  const fat_g = parseFloat(food.fat_g) * qty;

  const result = await pool.query(
    `INSERT INTO meal_logs 
      (user_id, food_id, meal_type, quantity, calories, protein_g, carbs_g, fat_g)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [userId, food_id, meal_type, qty, calories, protein_g, carbs_g, fat_g]
  );

  return result.rows[0];
};

// ======================
// GET TODAY'S MEALS
// ======================
const getTodayMeals = async (userId) => {
  const result = await pool.query(
    `SELECT 
        ml.id, ml.meal_type, ml.quantity, ml.calories, ml.protein_g, ml.carbs_g, ml.fat_g,
        ml.log_date, ml.created_at,
        f.name as food_name, f.brand, f.serving_size
     FROM meal_logs ml
     JOIN foods f ON ml.food_id = f.id
     WHERE ml.user_id = $1 AND ml.log_date = CURRENT_DATE
     ORDER BY ml.created_at ASC`,
    [userId]
  );
  return result.rows;
};
const getRecentMealLogs = async (limit = 50) => {
  const result = await pool.query(
    `SELECT ml.id, ml.user_id, u.email, u.full_name,
            ml.food_id, f.name AS food_name,
            ml.meal_type, ml.quantity,
            ml.calories, ml.protein_g, ml.carbs_g, ml.fat_g,
            ml.log_date, ml.created_at
     FROM meal_logs ml
     JOIN users u ON u.id = ml.user_id
     LEFT JOIN foods f ON f.id = ml.food_id
     ORDER BY ml.created_at DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
};

const getMealLogsByDate = async (date) => {
  const result = await pool.query(
    `SELECT ml.id, ml.user_id, u.email, u.full_name,
            f.name AS food_name, ml.meal_type, ml.quantity,
            ml.calories, ml.protein_g, ml.carbs_g, ml.fat_g, ml.log_date
     FROM meal_logs ml
     JOIN users u ON u.id = ml.user_id
     LEFT JOIN foods f ON f.id = ml.food_id
     WHERE ml.log_date = $1
     ORDER BY ml.created_at DESC`,
    [date]
  );
  return result.rows;
};

// ======================
// GET DAILY SUMMARY
// ======================
const getDailySummary = async (userId) => {
  const totalsResult = await pool.query(
    `SELECT 
        COALESCE(SUM(calories), 0) as total_calories,
        COALESCE(SUM(protein_g), 0) as total_protein,
        COALESCE(SUM(carbs_g), 0) as total_carbs,
        COALESCE(SUM(fat_g), 0) as total_fat
     FROM meal_logs
     WHERE user_id = $1 AND log_date = CURRENT_DATE`,
    [userId]
  );

  const totals = totalsResult.rows[0];

  const profileResult = await pool.query(
    `SELECT age, sex, height_cm, weight_kg, activity_factor, goal_type
     FROM user_profiles WHERE user_id = $1`,
    [userId]
  );

  if (profileResult.rows.length === 0) {
    throw new Error('Profile not found. Please complete your profile first.');
  }

  const profile = profileResult.rows[0];
  const weight = parseFloat(profile.weight_kg);
  const height = parseFloat(profile.height_cm);
  const age = parseInt(profile.age);
  const activityFactor = parseFloat(profile.activity_factor) || 1.2;
  const sex = profile.sex.toLowerCase();
  const goalType = (profile.goal_type || '').toLowerCase();

  // Mifflin-St Jeor
  let bmr = sex === 'male'
    ? 10 * weight + 6.25 * height - 5 * age + 5
    : 10 * weight + 6.25 * height - 5 * age - 161;

  const tdee = Math.round(bmr * activityFactor);

  let calorieAdjustment = 0;
  let proteinRatio = 0.30;
  let carbRatio = 0.40;
  let fatRatio = 0.30;

  switch (goalType) {
    case 'weight loss':
    case 'cutting':
      calorieAdjustment = -500;
      proteinRatio = 0.35;
      carbRatio = 0.35;
      fatRatio = 0.30;
      break;
    case 'bulking':
      calorieAdjustment = 400;
      proteinRatio = 0.30;
      carbRatio = 0.45;
      fatRatio = 0.25;
      break;
    case 'recomposition':
    case 'toning':
      calorieAdjustment = 0;
      proteinRatio = 0.35;
      carbRatio = 0.35;
      fatRatio = 0.30;
      break;
    default:
      calorieAdjustment = 0;
  }

  const targetCalories = Math.round(tdee + calorieAdjustment);
  const targetProtein = Math.round((targetCalories * proteinRatio) / 4);
  const targetCarbs = Math.round((targetCalories * carbRatio) / 4);
  const targetFat = Math.round((targetCalories * fatRatio) / 9);

  return {
    date: new Date().toISOString().split('T')[0],
    consumed: {
      calories: parseFloat(totals.total_calories),
      protein_g: parseFloat(totals.total_protein),
      carbs_g: parseFloat(totals.total_carbs),
      fat_g: parseFloat(totals.total_fat)
    },
    targets: {
      calories: targetCalories,
      protein_g: targetProtein,
      carbs_g: targetCarbs,
      fat_g: targetFat
    },
    remaining: {
      calories: targetCalories - parseFloat(totals.total_calories),
      protein_g: targetProtein - parseFloat(totals.total_protein),
      carbs_g: targetCarbs - parseFloat(totals.total_carbs),
      fat_g: targetFat - parseFloat(totals.total_fat)
    }
  };
};

// ======================
// DELETE MEAL LOG
// ======================
const deleteMeal = async (userId, mealId) => {
  const result = await pool.query(
    `DELETE FROM meal_logs WHERE id = $1 AND user_id = $2 RETURNING *`,
    [mealId, userId]
  );
  return result.rows[0];
};

// ======================
// MEAL RECOMMENDATION
// ======================
const recommendMeals = async (userId) => {
  // 1. Get remaining macros
  const summary = await getDailySummary(userId);
  const remaining = summary.remaining;

  // 2. Get user's allergens
  const profileResult = await pool.query(
    `SELECT allergens FROM user_profiles WHERE user_id = $1`,
    [userId]
  );
  const userAllergens = profileResult.rows[0]?.allergens || [];

  // 3. Get safe foods only
  let foodQuery = `
    SELECT id, name, brand, serving_size, calories, protein_g, carbs_g, fat_g, allergen_tags
    FROM foods
    WHERE is_active = true
  `;
  const values = [];

  if (userAllergens.length > 0) {
    foodQuery += ` AND NOT (allergen_tags && $1)`;
    values.push(userAllergens);
  }

  foodQuery += ` ORDER BY protein_g DESC`;

  const foodsResult = await pool.query(foodQuery, values);
  const safeFoods = foodsResult.rows;

  // 4. Simple recommendation logic
  const breakfastCandidates = safeFoods
    .filter(f => parseFloat(f.calories) < 400 && parseFloat(f.protein_g) >= 5)
    .slice(0, 3);

  const mainCandidates = safeFoods
    .filter(f => parseFloat(f.protein_g) >= 15)
    .slice(0, 4);

  const snackCandidates = safeFoods
    .filter(f => parseFloat(f.calories) < 200)
    .slice(0, 3);

  const recommendations = [
    {
      meal_type: 'breakfast',
      reason: 'High protein start of the day',
      foods: breakfastCandidates
    },
    {
      meal_type: 'lunch',
      reason: 'High protein to hit remaining targets',
      foods: mainCandidates
    },
    {
      meal_type: 'dinner',
      reason: 'Balanced meal for remaining macros',
      foods: mainCandidates
    },
    {
      meal_type: 'snack',
      reason: 'Light options for remaining calories',
      foods: snackCandidates
    }
  ];

  return {
    remaining_macros: remaining,
    recommendations
  };
};

module.exports = {
  logMeal,
  getTodayMeals,
  getDailySummary,
  deleteMeal,
  recommendMeals,
  getRecentMealLogs,
  getMealLogsByDate
};