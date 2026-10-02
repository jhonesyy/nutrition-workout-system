const pool = require('../../config/db');

const getDashboardStats = async () => {
  const [
    users,
    mealsToday,
    workoutsToday,   // placeholder until workout_logs exist
    qrToday
  ] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS count FROM users WHERE is_active = true`),
    pool.query(`
      SELECT COUNT(*)::int AS count
      FROM meal_logs
      WHERE log_date = CURRENT_DATE
    `),
    
    pool.query(`
  SELECT COUNT(*)::int AS count
  FROM workout_logs
  WHERE log_date = CURRENT_DATE
`)
  ]);

  return {
    total_users: users.rows[0].count,
    meals_logged_today: mealsToday.rows[0].count,
    workouts_completed: workoutsToday.rows[0].count,
    qr_redeemed_today: qrToday.rows[0].count
  };
};

const getAnalyticsStats = async () => {
  const [
    activeUsers7d,
    meals7d,
    pointsRedeemed,
    totalRewards
  ] = await Promise.all([
    // Users who have any activity in last 7 days (meals or loyalty)
    pool.query(`
      SELECT COUNT(DISTINCT user_id)::int AS count FROM (
        SELECT user_id FROM meal_logs WHERE log_date >= CURRENT_DATE - INTERVAL '7 days'
        UNION
        SELECT user_id FROM loyalty_transactions WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
        UNION
        SELECT user_id FROM health_activity_logs WHERE log_date >= CURRENT_DATE - INTERVAL '7 days'
      ) t
    `),
    pool.query(`
      SELECT COUNT(*)::int AS count
      FROM meal_logs
      WHERE log_date >= CURRENT_DATE - INTERVAL '7 days'
    `),
    pool.query(`
      SELECT COALESCE(SUM(ABS(points)), 0)::int AS total
      FROM loyalty_transactions
      WHERE type = 'redeem'
    `),
    pool.query(`
      SELECT COUNT(*)::int AS count FROM rewards WHERE is_active = true
    `)
  ]);

  return {
    active_users_7d: activeUsers7d.rows[0].count,
    meals_logged_7d: meals7d.rows[0].count,
    points_redeemed: pointsRedeemed.rows[0].total,
    active_rewards: totalRewards.rows[0].count
  };
};

module.exports = {
  getDashboardStats,
  getAnalyticsStats
};