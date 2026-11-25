const pool = require('../../config/db');

// ======================
// EXERCISE MANAGEMENT
// ======================
const getAllExercises = async ({ muscle_group, difficulty, equipment } = {}) => {
  let query = `SELECT * FROM exercises WHERE 1=1`;
  const values = [];
  let idx = 1;

  if (muscle_group) { query += ` AND muscle_group ILIKE $${idx++}`; values.push(`%${muscle_group}%`); }
  if (difficulty) { query += ` AND difficulty ILIKE $${idx++}`; values.push(difficulty); }
  if (equipment) { query += ` AND equipment ILIKE $${idx++}`; values.push(`%${equipment}%`); }

  query += ` ORDER BY muscle_group, name`;
  const result = await pool.query(query, values);
  return result.rows;
};

const getExerciseById = async (id) => {
  const result = await pool.query(`SELECT * FROM exercises WHERE id = $1`, [id]);
  return result.rows[0];
};

const createExercise = async (data) => {
  const { name, muscle_group, equipment, difficulty, default_sets, default_reps, rest_seconds, common_errors, form_tips } = data;
  if (!name) throw new Error('Exercise name is required');

  const result = await pool.query(
    `INSERT INTO exercises (name, muscle_group, equipment, difficulty, default_sets, default_reps, rest_seconds, common_errors, form_tips)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [name, muscle_group || null, equipment || null, difficulty || null, default_sets || null, default_reps || null, rest_seconds || null, common_errors || null, form_tips || null]
  );
  return result.rows[0];
};

const updateExercise = async (id, data) => {
  const { name, muscle_group, equipment, difficulty, default_sets, default_reps, rest_seconds, common_errors, form_tips } = data;
  const result = await pool.query(
    `UPDATE exercises SET name = COALESCE($1, name), muscle_group = COALESCE($2, muscle_group), equipment = COALESCE($3, equipment),
       difficulty = COALESCE($4, difficulty), default_sets = COALESCE($5, default_sets), default_reps = COALESCE($6, default_reps),
       rest_seconds = COALESCE($7, rest_seconds), common_errors = COALESCE($8, common_errors), form_tips = COALESCE($9, form_tips), updated_at = CURRENT_TIMESTAMP
     WHERE id = $10 RETURNING *`,
    [name, muscle_group, equipment, difficulty, default_sets, default_reps, rest_seconds, common_errors, form_tips, id]
  );
  return result.rows[0] || null;
};

const deleteExercise = async (id) => {
  const result = await pool.query(`DELETE FROM exercises WHERE id = $1 RETURNING id, name`, [id]);
  return result.rows[0] || null;
};

// ======================
// WORKOUT LOGGING
// ======================
const logWorkout = async (userId, data) => {
  const { exercise_id, exercise_name, sets_completed, reps_completed, weight_kg, duration_minutes, notes, log_date } = data;

  let name = exercise_name || null;
  if (exercise_id && !name) {
    const ex = await pool.query('SELECT name FROM exercises WHERE id = $1', [exercise_id]);
    name = ex.rows[0]?.name || null;
  }

  const result = await pool.query(
    `INSERT INTO workout_logs (user_id, exercise_id, exercise_name, sets_completed, reps_completed, weight_kg, duration_minutes, notes, log_date)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9::date, CURRENT_DATE)) RETURNING *`,
    [userId, exercise_id || null, name, sets_completed || null, reps_completed || null, weight_kg || null, duration_minutes || null, notes || null, log_date || null]
  );
  return result.rows[0];
};

const getMyWorkoutLogs = async (userId, limit = 50) => {
  const result = await pool.query(
    `SELECT * FROM workout_logs WHERE user_id = $1 ORDER BY log_date DESC, created_at DESC LIMIT $2`,
    [userId, limit]
  );
  return result.rows;
};

const getAdminWorkoutLogs = async (limit = 50) => {
  const result = await pool.query(
    `SELECT wl.*, u.email, u.full_name FROM workout_logs wl JOIN users u ON u.id = wl.user_id ORDER BY wl.created_at DESC LIMIT $1`,
    [limit]
  );
  return result.rows;
};

const countWorkoutsToday = async () => {
  const result = await pool.query(`SELECT COUNT(*)::int AS count FROM workout_logs WHERE log_date = CURRENT_DATE`);
  return result.rows[0].count;
};

// ======================
// NEW: DATASET-DRIVEN RECOMMENDATIONS
// ======================
const recommendWorkouts = async (userId) => {
  // 1. Get user's goal / fitness context
  const profileResult = await pool.query(`SELECT goal_type, goal_category FROM user_profiles WHERE user_id = $1`, [userId]);
  const profile = profileResult.rows[0] || {};
  const goalType = (profile.goal_type || 'general fitness').toLowerCase();
  const goalCat  = (profile.goal_category || '').toLowerCase();

  // 2. Pull the exercise catalog from your dataset
  const exResult = await pool.query(`SELECT id, name, muscle_group, equipment, difficulty, default_sets, default_reps FROM exercises ORDER BY id ASC`);
  const catalog = exResult.rows;

  // 3. Helpers
  const lv = (e) => (e.difficulty || '').toLowerCase();
  const mg = (e) => (e.muscle_group || '').toLowerCase();
  const byDifficulty = (levels) => catalog.filter(e => levels.includes(lv(e)));
  const byMuscle = (keys) => catalog.filter(e => keys.some(k => mg(e).includes(k)));

  const isCut = ['weight loss','cutting','fat loss','lean'].some(k => goalType.includes(k) || goalCat.includes(k));
  const isBulk = ['bulking','muscle gain','strength','mass','athletic'].some(k => goalType.includes(k) || goalCat.includes(k));

  const heavyPool = isBulk ? byDifficulty(['intermediate','advanced']) : catalog;
  const metabolicPool = isCut ? byDifficulty(['beginner','intermediate']) : catalog;

  // 4. Group by focus area
  const strength = byMuscle(['chest','back','leg','shoulder','compound']).filter(e => heavyPool.includes(e)).slice(0, 4);
  const hypertrophy = byMuscle(['arm','chest','back','leg','shoulder','bicep','tricep','quad','hamstring']).filter(e => (isBulk ? heavyPool : catalog).includes(e)).slice(0, 4);
  const conditioning = byMuscle(['cardio','full body','hiit','conditioning']).filter(e => (isCut ? metabolicPool : catalog).includes(e)).slice(0, 3);
  const coreMobility = byMuscle(['core','abs','mobility','stability']).slice(0, 3);

  return {
    goal: goalType,
    weekly_focus: isBulk ? 'strength + volume' : isCut ? 'metabolic + deficit' : 'balanced',
    recommendations: [
      { focus: 'Strength / Compound', reason: 'Foundational lifts for overall power.', exercises: strength },
      { focus: 'Hypertrophy / Isolation', reason: 'Accessory work to balance muscle groups.', exercises: hypertrophy },
      { focus: 'Conditioning / Cardio', reason: 'Heart-health and endurance baseline.', exercises: conditioning },
      { focus: 'Core & Mobility', reason: 'Stability and range-of-motion for injury prevention.', exercises: coreMobility }
    ]
  };
};

// Keep your existing generateWorkoutPlan if you still want it
const generateWorkoutPlan = async (userId) => {
  // ... (your existing generateWorkoutPlan code remains here if needed, or you can rely on recommendWorkouts)
  return await recommendWorkouts(userId); // Simple alias for now
};

module.exports = {
  getAllExercises,
  getExerciseById,
  createExercise,
  updateExercise,
  deleteExercise,
  generateWorkoutPlan,
  logWorkout,
  getMyWorkoutLogs,
  getAdminWorkoutLogs,
  countWorkoutsToday,
  recommendWorkouts
};