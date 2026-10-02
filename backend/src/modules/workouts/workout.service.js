const pool = require('../../config/db');

// Get all exercises (with optional filters)
const getAllExercises = async ({ muscle_group, difficulty, equipment } = {}) => {
  let query = `SELECT * FROM exercises WHERE 1=1`;
  const values = [];
  let idx = 1;

  if (muscle_group) {
    query += ` AND muscle_group ILIKE $${idx++}`;
    values.push(`%${muscle_group}%`);
  }

  if (difficulty) {
    query += ` AND difficulty ILIKE $${idx++}`;
    values.push(difficulty);
  }

  if (equipment) {
    query += ` AND equipment ILIKE $${idx++}`;
    values.push(`%${equipment}%`);
  }

  query += ` ORDER BY muscle_group, name`;

  const result = await pool.query(query, values);
  return result.rows;
};

// Get single exercise
const getExerciseById = async (id) => {
  const result = await pool.query(
    `SELECT * FROM exercises WHERE id = $1`,
    [id]
  );

  return result.rows[0];
};
const logWorkout = async (userId, data) => {
  const {
    exercise_id,
    exercise_name,
    sets_completed,
    reps_completed,
    weight_kg,
    duration_minutes,
    notes,
    log_date
  } = data;

  let name = exercise_name || null;
  if (exercise_id && !name) {
    const ex = await pool.query('SELECT name FROM exercises WHERE id = $1', [exercise_id]);
    name = ex.rows[0]?.name || null;
  }

  const result = await pool.query(
    `INSERT INTO workout_logs
       (user_id, exercise_id, exercise_name, sets_completed, reps_completed,
        weight_kg, duration_minutes, notes, log_date)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, CURRENT_DATE))
     RETURNING *`,
    [
      userId,
      exercise_id || null,
      name,
      sets_completed || null,
      reps_completed || null,
      weight_kg || null,
      duration_minutes || null,
      notes || null,
      log_date || null
    ]
  );
  return result.rows[0];
};

const getMyWorkoutLogs = async (userId, limit = 50) => {
  const result = await pool.query(
    `SELECT * FROM workout_logs
     WHERE user_id = $1
     ORDER BY log_date DESC, created_at DESC
     LIMIT $2`,
    [userId, limit]
  );
  return result.rows;
};

const getAdminWorkoutLogs = async (limit = 50) => {
  const result = await pool.query(
    `SELECT wl.*, u.email, u.full_name
     FROM workout_logs wl
     JOIN users u ON u.id = wl.user_id
     ORDER BY wl.created_at DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
};

const countWorkoutsToday = async () => {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM workout_logs
     WHERE log_date = CURRENT_DATE`
  );
  return result.rows[0].count;
};
// Create exercise
const createExercise = async (data) => {
  const {
    name, muscle_group, equipment, difficulty,
    default_sets, default_reps, rest_seconds,
    common_errors, form_tips
  } = data;

  if (!name) {
    throw new Error('Exercise name is required');
  }
const logWorkout = async (userId, data) => {
  const {
    exercise_id,
    exercise_name,
    sets_completed,
    reps_completed,
    weight_kg,
    duration_minutes,
    notes,
    log_date
  } = data;

  let name = exercise_name || null;
  if (exercise_id && !name) {
    const ex = await pool.query('SELECT name FROM exercises WHERE id = $1', [exercise_id]);
    name = ex.rows[0]?.name || null;
  }

  const result = await pool.query(
    `INSERT INTO workout_logs
       (user_id, exercise_id, exercise_name, sets_completed, reps_completed,
        weight_kg, duration_minutes, notes, log_date)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9::date, CURRENT_DATE))
     RETURNING *`,
    [
      userId,
      exercise_id || null,
      name,
      sets_completed || null,
      reps_completed || null,
      weight_kg || null,
      duration_minutes || null,
      notes || null,
      log_date || null
    ]
  );
  return result.rows[0];
};

const getMyWorkoutLogs = async (userId, limit = 50) => {
  const result = await pool.query(
    `SELECT * FROM workout_logs
     WHERE user_id = $1
     ORDER BY log_date DESC, created_at DESC
     LIMIT $2`,
    [userId, limit]
  );
  return result.rows;
};

const getAdminWorkoutLogs = async (limit = 50) => {
  const result = await pool.query(
    `SELECT wl.*, u.email, u.full_name
     FROM workout_logs wl
     JOIN users u ON u.id = wl.user_id
     ORDER BY wl.created_at DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
};

  const result = await pool.query(
    `INSERT INTO exercises
       (name, muscle_group, equipment, difficulty, default_sets, default_reps, rest_seconds, common_errors, form_tips)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      name,
      muscle_group || null,
      equipment || null,
      difficulty || null,
      default_sets || null,
      default_reps || null,
      rest_seconds || null,
      common_errors || null,
      form_tips || null
    ]
  );

  return result.rows[0];
};

// Update exercise
const updateExercise = async (id, data) => {
  const {
    name, muscle_group, equipment, difficulty,
    default_sets, default_reps, rest_seconds,
    common_errors, form_tips
  } = data;

  const result = await pool.query(
    `UPDATE exercises SET
       name          = COALESCE($1, name),
       muscle_group  = COALESCE($2, muscle_group),
       equipment     = COALESCE($3, equipment),
       difficulty    = COALESCE($4, difficulty),
       default_sets  = COALESCE($5, default_sets),
       default_reps  = COALESCE($6, default_reps),
       rest_seconds  = COALESCE($7, rest_seconds),
       common_errors = COALESCE($8, common_errors),
       form_tips     = COALESCE($9, form_tips),
       updated_at    = CURRENT_TIMESTAMP
     WHERE id = $10
     RETURNING *`,
    [
      name,
      muscle_group,
      equipment,
      difficulty,
      default_sets,
      default_reps,
      rest_seconds,
      common_errors,
      form_tips,
      id
    ]
  );

  return result.rows[0] || null;
};

// Delete exercise
const deleteExercise = async (id) => {
  const result = await pool.query(
    `DELETE FROM exercises WHERE id = $1 RETURNING id, name`,
    [id]
  );

  return result.rows[0] || null;
};

// Generate a simple goal-based workout plan
const generateWorkoutPlan = async (userId) => {
  // Get user goal
  const profileResult = await pool.query(
    `SELECT goal_type, goal_category FROM user_profiles WHERE user_id = $1`,
    [userId]
  );

  if (profileResult.rows.length === 0) {
    throw new Error('Please complete your profile first');
  }

  const { goal_type, goal_category } = profileResult.rows[0];
  const goal = (goal_type || '').toLowerCase();

  // Simple mapping of goals to preferred muscle focus / difficulty
  let preferredMuscles = [];
  let difficultyFilter = null;

  if (goal.includes('strength') || goal.includes('athletic')) {
    preferredMuscles = ['Legs', 'Back', 'Chest', 'Shoulders'];
    difficultyFilter = 'Intermediate';
  } else if (
    goal.includes('hypertrophy') ||
    goal.includes('bulking') ||
    goal.includes('toning')
  ) {
    preferredMuscles = [
      'Chest',
      'Back',
      'Legs',
      'Shoulders',
      'Biceps',
      'Triceps'
    ];
  } else if (
    goal.includes('weight loss') ||
    goal.includes('cutting') ||
    goal.includes('recomposition')
  ) {
    preferredMuscles = [
      'Legs',
      'Back',
      'Chest',
      'Core',
      'Cardio'
    ];
  } else {
    preferredMuscles = [
      'Chest',
      'Back',
      'Legs',
      'Shoulders',
      'Core'
    ];
  }

  // Fetch exercises
  const allExercises = await getAllExercises();

  const plan = [];

  for (const muscle of preferredMuscles) {
    const matches = allExercises.filter(e =>
      e.muscle_group.toLowerCase().includes(muscle.toLowerCase())
    );

    if (matches.length > 0) {
      // Pick 1-2 exercises per muscle group
      const selected = matches.slice(0, muscle === 'Cardio' ? 1 : 2);
      plan.push(...selected);
    }
  }

  // Limit to reasonable workout size
  const finalPlan = plan.slice(0, 8).map((ex, index) => ({
    order: index + 1,
    exercise_id: ex.id,
    name: ex.name,
    muscle_group: ex.muscle_group,
    equipment: ex.equipment,
    sets: ex.default_sets,
    reps: ex.default_reps,
    rest_seconds: ex.rest_seconds,
    common_errors: ex.common_errors,
    form_tips: ex.form_tips
  }));

  return {
    goal: goal_type || 'General Fitness',
    goal_category: goal_category || 'Body Composition',
    total_exercises: finalPlan.length,
    estimated_duration_minutes:
      finalPlan.reduce((sum, e) => sum + (e.sets * 2), 0) + 10,
    workout: finalPlan
  };
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
  getAdminWorkoutLogs
};