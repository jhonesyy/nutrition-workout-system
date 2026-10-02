const pool = require('../../config/db');
const bcrypt = require('bcrypt');

const SALT_ROUNDS = 10;

// ======================
// GET PROFILE
// ======================

const getProfile = async (userId) => {
  const result = await pool.query(
    `SELECT
       u.id,
       u.email,
       u.full_name,
       u.role,
       u.created_at,
       p.age,
       p.sex,
       p.height_cm,
       p.weight_kg,
       p.activity_factor,
       p.goal_type,
       p.goal_category,
       p.allergens
     FROM users u
     LEFT JOIN user_profiles p
       ON u.id = p.user_id
     WHERE u.id = $1`,
    [userId]
  );

  return result.rows[0];
};

// ======================
// UPSERT PROFILE
// ======================

const upsertProfile = async (userId, data) => {
  const {
    age,
    sex,
    height_cm,
    weight_kg,
    activity_factor,
    goal_type,
    goal_category,
    allergens
  } = data;

  const existing = await pool.query(
    'SELECT id FROM user_profiles WHERE user_id = $1',
    [userId]
  );

  if (existing.rows.length > 0) {
    const result = await pool.query(
      `UPDATE user_profiles SET
         age = COALESCE($1, age),
         sex = COALESCE($2, sex),
         height_cm = COALESCE($3, height_cm),
         weight_kg = COALESCE($4, weight_kg),
         activity_factor = COALESCE($5, activity_factor),
         goal_type = COALESCE($6, goal_type),
         goal_category = COALESCE($7, goal_category),
         allergens = COALESCE($8, allergens),
         updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $9
       RETURNING *`,
      [
        age,
        sex,
        height_cm,
        weight_kg,
        activity_factor,
        goal_type,
        goal_category,
        allergens,
        userId
      ]
    );

    return result.rows[0];
  }

  const result = await pool.query(
    `INSERT INTO user_profiles
       (
         user_id,
         age,
         sex,
         height_cm,
         weight_kg,
         activity_factor,
         goal_type,
         goal_category,
         allergens
       )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      userId,
      age,
      sex,
      height_cm,
      weight_kg,
      activity_factor || 1.2,
      goal_type,
      goal_category,
      allergens
    ]
  );

  return result.rows[0];
};

// ======================
// CALCULATE TDEE + MACROS
// ======================

const calculateTDEE = async (userId) => {
  const profile = await getProfile(userId);

  if (
    !profile ||
    !profile.age ||
    !profile.sex ||
    !profile.height_cm ||
    !profile.weight_kg
  ) {
    throw new Error(
      'Incomplete profile. Please update age, sex, height, and weight first.'
    );
  }

  const weight = parseFloat(profile.weight_kg);
  const height = parseFloat(profile.height_cm);
  const age = parseInt(profile.age);
  const activityFactor =
    parseFloat(profile.activity_factor) || 1.2;

  const sex = profile.sex.toLowerCase();
  const goalType = (profile.goal_type || '').toLowerCase();

  // Mifflin-St Jeor
  let bmr;

  if (sex === 'male') {
    bmr =
      10 * weight +
      6.25 * height -
      5 * age +
      5;
  } else {
    bmr =
      10 * weight +
      6.25 * height -
      5 * age -
      161;
  }

  // TDEE
  const tdee = Math.round(
    bmr * activityFactor
  );

  // Goal adjustment
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

    case 'athletic':
    case 'performance':
    case 'hypertrophy':
      calorieAdjustment = 250;
      proteinRatio = 0.30;
      carbRatio = 0.45;
      fatRatio = 0.25;
      break;

    case 'strength':
      calorieAdjustment = 300;
      proteinRatio = 0.30;
      carbRatio = 0.40;
      fatRatio = 0.30;
      break;

    default:
      calorieAdjustment = 0;
  }

  const targetCalories =
    Math.round(tdee + calorieAdjustment);

  const proteinGrams =
    Math.round(
      (targetCalories * proteinRatio) / 4
    );

  const carbGrams =
    Math.round(
      (targetCalories * carbRatio) / 4
    );

  const fatGrams =
    Math.round(
      (targetCalories * fatRatio) / 9
    );

  return {
    profile: {
      age: profile.age,
      sex: profile.sex,
      height_cm: profile.height_cm,
      weight_kg: profile.weight_kg,
      activity_factor: profile.activity_factor,
      goal_type: profile.goal_type,
      goal_category: profile.goal_category
    },

    calculations: {
      bmr: Math.round(bmr),
      tdee,
      calorie_adjustment: calorieAdjustment,
      target_calories: targetCalories
    },

    macros: {
      protein_g: proteinGrams,
      carbs_g: carbGrams,
      fat_g: fatGrams,
      protein_ratio:
        Math.round(proteinRatio * 100) + '%',
      carb_ratio:
        Math.round(carbRatio * 100) + '%',
      fat_ratio:
        Math.round(fatRatio * 100) + '%'
    }
  };
};

// ======================
// ADMIN: LIST USERS
// ======================

const getAllUsers = async () => {
  const result = await pool.query(
    `SELECT
       id,
       email,
       full_name,
       role,
       is_active,
       created_at
     FROM users
     ORDER BY created_at DESC`
  );

  return result.rows;
};

// ======================
// ADMIN: CREATE STAFF
// ======================

const createStaffUser = async ({
  email,
  password,
  full_name,
  role
}) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Normalize email
    const normalizedEmail =
      String(email).trim().toLowerCase();

    // Check duplicate
    const existing = await client.query(
      'SELECT id FROM users WHERE LOWER(email) = LOWER($1)',
      [normalizedEmail]
    );

    if (existing.rows.length > 0) {
      throw new Error('Email already registered');
    }

    // Hash password
    const password_hash =
      await bcrypt.hash(
        password,
        SALT_ROUNDS
      );

    // Create user
    const result = await client.query(
      `INSERT INTO users
         (
           email,
           password_hash,
           full_name,
           role
         )
       VALUES ($1, $2, $3, $4)
       RETURNING
         id,
         email,
         full_name,
         role,
         is_active,
         created_at`,
      [
        normalizedEmail,
        password_hash,
        full_name,
        role
      ]
    );

    const user = result.rows[0];

    // Create profile
    await client.query(
      `INSERT INTO user_profiles (user_id)
       VALUES ($1)`,
      [user.id]
    );

    // Create loyalty record
    await client.query(
      `INSERT INTO loyalty_points (user_id)
       VALUES ($1)`,
      [user.id]
    );

    await client.query('COMMIT');

    return user;

  } catch (error) {
    await client.query('ROLLBACK');

    // PostgreSQL duplicate email protection
    if (error.code === '23505') {
      throw new Error('Email already registered');
    }

    throw error;

  } finally {
    client.release();
  }
};

// ======================
// ADMIN: ACTIVATE / DEACTIVATE
// ======================

const setActiveStatus = async (
  userId,
  isActive
) => {
  const result = await pool.query(
    `UPDATE users
     SET
       is_active = $1,
       updated_at = CURRENT_TIMESTAMP
     WHERE id = $2
     RETURNING
       id,
       email,
       full_name,
       role,
       is_active`,
    [
      isActive,
      userId
    ]
  );

  if (result.rows.length === 0) {
    throw new Error('User not found');
  }

  return result.rows[0];
};

// ======================
// EXPORT
// ======================

module.exports = {
  getProfile,
  upsertProfile,
  calculateTDEE,
  getAllUsers,
  createStaffUser,
  setActiveStatus
};