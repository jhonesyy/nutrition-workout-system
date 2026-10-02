const pool = require('../../config/db');

// Get all foods (with optional search)
const getAllFoods = async (search = '') => {
  let query = `
    SELECT id, name, brand, serving_size, calories, protein_g, carbs_g, fat_g, fiber_g, allergen_tags, source
    FROM foods
    WHERE is_active = true
  `;
  const values = [];

  if (search) {
    query += ` AND (name ILIKE $1 OR brand ILIKE $1)`;
    values.push(`%${search}%`);
  }

  query += ` ORDER BY name ASC LIMIT 100`;

  const result = await pool.query(query, values);
  return result.rows;
};

// Get single food by ID
const getFoodById = async (id) => {
  const result = await pool.query(
    `SELECT * FROM foods WHERE id = $1 AND is_active = true`,
    [id]
  );
  return result.rows[0];
};

// Create new food
const createFood = async (data) => {
  const {
    name, brand, serving_size, calories, protein_g, carbs_g, fat_g, fiber_g, allergen_tags, source
  } = data;

  const result = await pool.query(
    `INSERT INTO foods 
      (name, brand, serving_size, calories, protein_g, carbs_g, fat_g, fiber_g, allergen_tags, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      name,
      brand || null,
      serving_size || null,
      calories,
      protein_g,
      carbs_g,
      fat_g,
      fiber_g || 0,
      allergen_tags || [],
      source || 'local'
    ]
  );
  return result.rows[0];
};

// Update food
const updateFood = async (id, data) => {
  const {
    name, brand, serving_size, calories, protein_g, carbs_g,
    fat_g, fiber_g, allergen_tags, source, is_active
  } = data;

  const result = await pool.query(
    `UPDATE foods SET
       name          = COALESCE($1, name),
       brand         = COALESCE($2, brand),
       serving_size  = COALESCE($3, serving_size),
       calories      = COALESCE($4, calories),
       protein_g     = COALESCE($5, protein_g),
       carbs_g       = COALESCE($6, carbs_g),
       fat_g         = COALESCE($7, fat_g),
       fiber_g       = COALESCE($8, fiber_g),
       allergen_tags = COALESCE($9, allergen_tags),
       source        = COALESCE($10, source),
       is_active     = COALESCE($11, is_active),
       updated_at    = CURRENT_TIMESTAMP
     WHERE id = $12
     RETURNING *`,
    [
      name, brand, serving_size, calories, protein_g, carbs_g,
      fat_g, fiber_g, allergen_tags, source, is_active, id
    ]
  );

  return result.rows[0] || null;
};

// Soft delete food
const softDeleteFood = async (id) => {
  const result = await pool.query(
    `UPDATE foods
     SET is_active = false, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
     RETURNING id, name, is_active`,
    [id]
  );

  return result.rows[0] || null;
};

// Get safe foods for a user (exclude their allergens)
const getSafeFoods = async (userId, search = '') => {
  // First get user's allergens
  const profileResult = await pool.query(
    `SELECT allergens FROM user_profiles WHERE user_id = $1`,
    [userId]
  );

  const userAllergens = profileResult.rows[0]?.allergens || [];

  let query = `
    SELECT id, name, brand, serving_size, calories, protein_g, carbs_g, fat_g, fiber_g, allergen_tags
    FROM foods
    WHERE is_active = true
  `;
  const values = [];
  let paramIndex = 1;

  // Exclude foods that contain any of the user's allergens
  if (userAllergens.length > 0) {
    query += ` AND NOT (allergen_tags && $${paramIndex})`;
    values.push(userAllergens);
    paramIndex++;
  }

  if (search) {
    query += ` AND (name ILIKE $${paramIndex} OR brand ILIKE $${paramIndex})`;
    values.push(`%${search}%`);
  }

  query += ` ORDER BY name ASC LIMIT 100`;

  const result = await pool.query(query, values);
  return result.rows;
};

module.exports = {
  getAllFoods,
  getFoodById,
  createFood,
  getSafeFoods,
  updateFood,
  softDeleteFood
};