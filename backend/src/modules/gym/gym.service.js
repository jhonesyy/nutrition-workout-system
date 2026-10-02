const pool = require('../../config/db');

const getSettings = async () => {
  const result = await pool.query('SELECT * FROM gym_settings ORDER BY id LIMIT 1');
  return result.rows[0] || null;
};

const updateSettings = async (data) => {
  const { name, address, contact_number, operating_hours } = data;

  // Ensure one row exists
  const existing = await pool.query('SELECT id FROM gym_settings ORDER BY id LIMIT 1');
  if (existing.rows.length === 0) {
    const result = await pool.query(
      `INSERT INTO gym_settings (name, address, contact_number, operating_hours)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [name || 'House of Strength GYM', address || null, contact_number || null, operating_hours || null]
    );
    return result.rows[0];
  }

  const id = existing.rows[0].id;
  const result = await pool.query(
    `UPDATE gym_settings SET
       name            = COALESCE($1, name),
       address         = COALESCE($2, address),
       contact_number  = COALESCE($3, contact_number),
       operating_hours = COALESCE($4, operating_hours),
       updated_at      = CURRENT_TIMESTAMP
     WHERE id = $5
     RETURNING *`,
    [name, address, contact_number, operating_hours, id]
  );
  return result.rows[0];
};

const getRewards = async () => {
  const result = await pool.query(
    `SELECT * FROM rewards WHERE is_active = true ORDER BY points_required ASC`
  );
  return result.rows;
};

const getAllRewards = async () => {
  const result = await pool.query(`SELECT * FROM rewards ORDER BY points_required ASC`);
  return result.rows;
};

const createReward = async ({ name, points_required, description }) => {
  if (!name || !points_required) {
    throw new Error('name and points_required are required');
  }
  const result = await pool.query(
    `INSERT INTO rewards (name, points_required, description)
     VALUES ($1, $2, $3) RETURNING *`,
    [name, points_required, description || null]
  );
  return result.rows[0];
};

const updateReward = async (id, data) => {
  const { name, points_required, description, is_active } = data;
  const result = await pool.query(
    `UPDATE rewards SET
       name            = COALESCE($1, name),
       points_required = COALESCE($2, points_required),
       description     = COALESCE($3, description),
       is_active       = COALESCE($4, is_active),
       updated_at      = CURRENT_TIMESTAMP
     WHERE id = $5
     RETURNING *`,
    [name, points_required, description, is_active, id]
  );
  return result.rows[0] || null;
};

const deleteReward = async (id) => {
  const result = await pool.query(
    `UPDATE rewards SET is_active = false, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 RETURNING id, name, is_active`,
    [id]
  );
  return result.rows[0] || null;
};

module.exports = {
  getSettings,
  updateSettings,
  getRewards,
  getAllRewards,
  createReward,
  updateReward,
  deleteReward
};