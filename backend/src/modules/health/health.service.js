const pool = require('../../config/db');
const loyaltyService = require('../loyalty/loyalty.service');

// Sync / upsert today's activity data
const syncActivity = async (userId, { steps, active_calories }) => {
  const stepsValue = parseInt(steps) || 0;
  const caloriesValue = parseFloat(active_calories) || 0;

  const result = await pool.query(
    `INSERT INTO health_activity_logs (user_id, steps, active_calories, log_date)
     VALUES ($1, $2, $3, CURRENT_DATE)
     ON CONFLICT (user_id, log_date)
     DO UPDATE SET
       steps = EXCLUDED.steps,
       active_calories = EXCLUDED.active_calories,
       updated_at = CURRENT_TIMESTAMP
     RETURNING *`,
    [userId, stepsValue, caloriesValue]
  );

  // Simple reward: award points if daily step goal is reached
  const STEP_GOAL = 8000;
  const POINTS_FOR_GOAL = 20;

  if (stepsValue >= STEP_GOAL) {
    // Check if we already awarded points today for steps
    const alreadyAwarded = await pool.query(
      `SELECT id FROM loyalty_transactions
       WHERE user_id = $1
         AND description LIKE 'Daily step goal%'
         AND created_at::date = CURRENT_DATE`,
      [userId]
    );

    if (alreadyAwarded.rows.length === 0) {
      await loyaltyService.addPoints(
        userId,
        POINTS_FOR_GOAL,
        `Daily step goal reached (${stepsValue} steps)`,
        `steps_${new Date().toISOString().slice(0, 10)}`
      );
    }
  }

  return result.rows[0];
};

// Get today's activity
const getTodayActivity = async (userId) => {
  const result = await pool.query(
    `SELECT steps, active_calories, log_date, updated_at
     FROM health_activity_logs
     WHERE user_id = $1 AND log_date = CURRENT_DATE`,
    [userId]
  );

  if (result.rows.length === 0) {
    return { steps: 0, active_calories: 0, log_date: new Date().toISOString().slice(0, 10) };
  }

  return result.rows[0];
};

// Get activity history (last 7 days)
const getActivityHistory = async (userId) => {
  const result = await pool.query(
    `SELECT log_date, steps, active_calories
     FROM health_activity_logs
     WHERE user_id = $1
     ORDER BY log_date DESC
     LIMIT 7`,
    [userId]
  );
  return result.rows;
};

module.exports = {
  syncActivity,
  getTodayActivity,
  getActivityHistory
};