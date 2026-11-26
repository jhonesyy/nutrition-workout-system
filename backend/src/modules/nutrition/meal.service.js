const pool = require('../../config/db');

// ======================
// LOG A MEAL (catalog OR custom / AI-generated)
// ======================
const logMeal = async (userId, data) => {
  const {
    food_id,
    food_name,
    meal_type,
    quantity,
    calories: inputCalories,
    protein_g: inputProtein,
    carbs_g: inputCarbs,
    fat_g: inputFat,
    notes,
    custom_items,
    source: inputSource
  } = data;

  const qty = parseFloat(quantity) || 1;
  if (qty <= 0) throw new Error('Quantity must be greater than 0');

  let calories, protein_g, carbs_g, fat_g, resolvedFoodId, resolvedName, source;

  // ----- Path A: Catalog food (existing behaviour) -----
  if (food_id != null && food_id !== '' && !Number.isNaN(Number(food_id))) {
    const foodResult = await pool.query(
      `SELECT id, name, calories, protein_g, carbs_g, fat_g
       FROM foods WHERE id = $1 AND is_active = true`,
      [Number(food_id)]
    );
    if (foodResult.rows.length === 0) {
      throw new Error('Food not found');
    }
    const food = foodResult.rows[0];
    resolvedFoodId = food.id;
    resolvedName = food.name;
    calories = parseFloat(food.calories) * qty;
    protein_g = parseFloat(food.protein_g) * qty;
    carbs_g = parseFloat(food.carbs_g) * qty;
    fat_g = parseFloat(food.fat_g) * qty;
    source = 'food_catalog';
  }
  // ----- Path B: Custom / AI-generated meal (no catalog ID) -----
  else {
    const name = (food_name || '').trim();
    if (!name) {
      throw new Error('Either food_id or food_name is required');
    }
    const cal = Number(inputCalories);
    const pro = Number(inputProtein);
    const carb = Number(inputCarbs);
    const fat = Number(inputFat);
    if ([cal, pro, carb, fat].some((v) => Number.isNaN(v) || v < 0)) {
      throw new Error('calories, protein_g, carbs_g and fat_g must be non-negative numbers');
    }
    if (cal > 10000 || pro > 500 || carb > 1000 || fat > 500) {
      throw new Error('Nutritional values exceed reasonable limits');
    }
    resolvedFoodId = null;
    resolvedName = name.substring(0, 255);
    calories = cal * qty;
    protein_g = pro * qty;
    carbs_g = carb * qty;
    fat_g = fat * qty;
    source = (inputSource === 'ai_generated' || inputSource === 'custom')
      ? inputSource
      : 'ai_generated';
  }

  const result = await pool.query(
    `INSERT INTO meal_logs
      (user_id, food_id, food_name, meal_type, quantity,
       calories, protein_g, carbs_g, fat_g, source, notes, custom_items)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING *`,
    [
      userId,
      resolvedFoodId,
      resolvedName,
      meal_type || null,
      qty,
      calories,
      protein_g,
      carbs_g,
      fat_g,
      source,
      notes || null,
      custom_items ? JSON.stringify(custom_items) : null
    ]
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
        ml.log_date, ml.created_at, ml.source, ml.notes, ml.food_id,
        COALESCE(ml.food_name, f.name) AS food_name,
        f.brand, f.serving_size
     FROM meal_logs ml
     LEFT JOIN foods f ON ml.food_id = f.id
     WHERE ml.user_id = $1 AND ml.log_date = CURRENT_DATE
     ORDER BY ml.created_at ASC`,
    [userId]
  );
  return result.rows;
};

const getRecentMealLogs = async (limit = 50) => {
  const result = await pool.query(
    `SELECT ml.id, ml.user_id, u.email, u.full_name,
            ml.food_id, COALESCE(ml.food_name, f.name) AS food_name,
            ml.meal_type, ml.quantity, ml.source,
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
            COALESCE(ml.food_name, f.name) AS food_name, ml.meal_type, ml.quantity,
            ml.source, ml.calories, ml.protein_g, ml.carbs_g, ml.fat_g, ml.log_date
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
  const summary = await getDailySummary(userId);
  const remaining = summary.remaining;

  const profileResult = await pool.query(
    `SELECT allergens FROM user_profiles WHERE user_id = $1`,
    [userId]
  );
  const userAllergens = profileResult.rows[0]?.allergens || [];

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