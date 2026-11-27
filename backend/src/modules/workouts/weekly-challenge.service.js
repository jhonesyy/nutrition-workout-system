
const pool = require('../../config/db');

// --------------------------------------------------
// WEEKLY CHALLENGE CONFIGURATION
// --------------------------------------------------

const POINTS = {
  easy: 10,
  medium: 20,
  hard: 35
};

const CHALLENGE_TEMPLATES = {
  easy: [
    {
      title: 'Start Strong',
      description: 'Complete your first workout day this week.'
    },
    {
      title: 'Build Your Habit',
      description: 'Get moving and complete at least one workout day.'
    },
    {
      title: 'Weekly Starter',
      description: 'Show up for one meaningful workout day.'
    }
  ],

  medium: [
    {
      title: 'Stay Consistent',
      description: 'Complete the required number of workout days this week.'
    },
    {
      title: 'Keep Moving',
      description: 'Stay active across multiple days this week.'
    },
    {
      title: 'Consistency Challenge',
      description: 'Build consistency by completing your weekly workout target.'
    }
  ],

  hard: [
    {
      title: 'Push Your Limits',
      description: 'Complete your full weekly workout challenge.'
    },
    {
      title: 'Weekly Warrior',
      description: 'Stay committed and complete your harder weekly target.'
    },
    {
      title: 'Strong Commitment',
      description: 'Finish your challenging weekly workout target.'
    }
  ]
};

// Targets based on assessment frequency.
const getTargets = (days) => {
  const targets = {
    2: { easy: 1, medium: 1, hard: 2 },
    3: { easy: 1, medium: 2, hard: 3 },
    4: { easy: 1, medium: 2, hard: 3 },
    5: { easy: 2, medium: 3, hard: 4 },
    6: { easy: 2, medium: 3, hard: 5 }
  };

  return targets[days] || null;
};

const randomItem = (items) =>
  items[Math.floor(Math.random() * items.length)];

// --------------------------------------------------
// PHILIPPINES WEEK CALCULATION
// Monday 00:00 through Sunday 23:59
// --------------------------------------------------

const getPhilippinesDate = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());

  const values = {};

  for (const part of parts) {
    if (part.type !== 'literal') {
      values[part.type] = part.value;
    }
  }

  return `${values.year}-${values.month}-${values.day}`;
};

const getCurrentWeek = () => {
  const today = getPhilippinesDate();
  const date = new Date(`${today}T00:00:00Z`);

  const day = date.getUTCDay();
  const daysSinceMonday = (day + 6) % 7;

  date.setUTCDate(date.getUTCDate() - daysSinceMonday);

  const weekStart = date.toISOString().slice(0, 10);

  date.setUTCDate(date.getUTCDate() + 6);

  const weekEnd = date.toISOString().slice(0, 10);

  return { weekStart, weekEnd };
};

// --------------------------------------------------
// CREATE OR RETRIEVE WEEKLY CHALLENGES
// --------------------------------------------------

const getWeeklyChallenges = async (userId) => {
  const assessmentResult = await pool.query(
    `SELECT workout_days_per_week, assessment_status
     FROM workout.user_workout_assessments
     WHERE user_id = $1`,
    [userId]
  );

  const assessment = assessmentResult.rows[0];

  if (!assessment || assessment.assessment_status !== 'completed') {
    throw new Error(
      'Complete your workout assessment before accessing weekly challenges.'
    );
  }

  const targets = getTargets(
    Number(assessment.workout_days_per_week)
  );

  if (!targets) {
    throw new Error('Invalid weekly workout frequency in assessment.');
  }

  const { weekStart, weekEnd } = getCurrentWeek();

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Expire unfinished challenges from previous weeks.
    await client.query(
      `UPDATE workout.weekly_challenges wc
       SET status = 'expired'
       FROM workout.weekly_challenge_sets ws
       WHERE wc.challenge_set_id = ws.id
         AND ws.user_id = $1
         AND ws.week_start < $2
         AND wc.status = 'active'`,
      [userId, weekStart]
    );

    // Create one challenge set per user per week.
    const setResult = await client.query(
      `INSERT INTO workout.weekly_challenge_sets (
         user_id,
         week_start,
         week_end
       )
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, week_start)
       DO NOTHING
       RETURNING id`,
      [userId, weekStart, weekEnd]
    );

    let setId = setResult.rows[0]?.id;

    if (!setId) {
      const existingSet = await client.query(
        `SELECT id
         FROM workout.weekly_challenge_sets
         WHERE user_id = $1
           AND week_start = $2
         FOR UPDATE`,
        [userId, weekStart]
      );

      setId = existingSet.rows[0].id;
    }

    // Generate exactly three challenges only once.
    const existingChallenges = await client.query(
      `SELECT id
       FROM workout.weekly_challenges
       WHERE challenge_set_id = $1`,
      [setId]
    );

    if (existingChallenges.rows.length === 0) {
      for (const difficulty of ['easy', 'medium', 'hard']) {
        const template = randomItem(
          CHALLENGE_TEMPLATES[difficulty]
        );

        await client.query(
          `INSERT INTO workout.weekly_challenges (
             challenge_set_id,
             challenge_type,
             title,
             description,
             difficulty,
             target_workout_days,
             reward_points
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            setId,
            difficulty,
            template.title,
            template.description,
            difficulty,
            targets[difficulty],
            POINTS[difficulty]
          ]
        );
      }
    }

    await client.query('COMMIT');

    const result = await pool.query(
      `SELECT
         ws.week_start,
         ws.week_end,
         wc.id,
         wc.challenge_type,
         wc.title,
         wc.description,
         wc.difficulty,
         wc.target_workout_days,
         wc.reward_points,
         wc.current_progress,
         wc.status,
         wc.completed_at,
         wc.points_awarded
       FROM workout.weekly_challenge_sets ws
       JOIN workout.weekly_challenges wc
         ON wc.challenge_set_id = ws.id
       WHERE ws.id = $1
       ORDER BY
         CASE wc.difficulty
           WHEN 'easy' THEN 1
           WHEN 'medium' THEN 2
           WHEN 'hard' THEN 3
         END`,
      [setId]
    );

    return {
      week_start: weekStart,
      week_end: weekEnd,
      challenges: result.rows
    };

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

// --------------------------------------------------
// UPDATE PROGRESS AND AWARD POINTS
// Called after a workout log is successfully inserted.
// --------------------------------------------------


const updateProgressFromWorkoutLog = async (userId, log) => {
  if (!log || !log.created_at) return [];

  const hasActivity =
    Number(log.sets_completed || 0) > 0 ||
    Number(log.duration_minutes || 0) > 0;

  if (!hasActivity) return [];

  const { weekStart, weekEnd } = getCurrentWeek();

  // Use the server-generated creation timestamp in Philippines time.
  const createdDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date(log.created_at));

  if (createdDate < weekStart || createdDate > weekEnd) {
    return [];
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const setResult = await client.query(
      `SELECT id
       FROM workout.weekly_challenge_sets
       WHERE user_id = $1
         AND week_start = $2
       FOR UPDATE`,
      [userId, weekStart]
    );

    if (setResult.rows.length === 0) {
      await client.query('COMMIT');
      return [];
    }

    const setId = setResult.rows[0].id;

    // Count distinct workout days using server timestamps.
    const activityResult = await client.query(
      `SELECT COUNT(
         DISTINCT (created_at AT TIME ZONE 'Asia/Manila')::date
       )::integer AS workout_days
       FROM workout.workout_logs
       WHERE user_id = $1
         AND (created_at AT TIME ZONE 'Asia/Manila')::date
             BETWEEN $2::date AND $3::date
         AND (
           COALESCE(sets_completed, 0) > 0
           OR COALESCE(duration_minutes, 0) > 0
         )`,
      [userId, weekStart, weekEnd]
    );

    const workoutDays = Number(
      activityResult.rows[0].workout_days
    );

    const challengesResult = await client.query(
      `SELECT *
       FROM workout.weekly_challenges
       WHERE challenge_set_id = $1
         AND status = 'active'
       ORDER BY id
       FOR UPDATE`,
      [setId]
    );

    const completedChallenges = [];

    for (const challenge of challengesResult.rows) {
      const target = Number(challenge.target_workout_days);
      const progress = Math.min(workoutDays, target);

      if (progress < target) {
        await client.query(
          `UPDATE workout.weekly_challenges
           SET current_progress = $1
           WHERE id = $2`,
          [progress, challenge.id]
        );

        continue;
      }

      if (challenge.points_awarded) {
        continue;
      }

      await client.query(
        `INSERT INTO loyalty.loyalty_points (
           user_id,
           total_points,
           lifetime_points
         )
         VALUES ($1, 0, 0)
         ON CONFLICT (user_id)
         DO NOTHING`,
        [userId]
      );

      const points = Number(challenge.reward_points);

      await client.query(
        `UPDATE loyalty.loyalty_points
         SET total_points = total_points + $1,
             lifetime_points = lifetime_points + $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $2`,
        [points, userId]
      );

      await client.query(
        `INSERT INTO loyalty.loyalty_transactions (
           user_id,
           points,
           type,
           description,
           reference_id
         )
         VALUES ($1, $2, 'earn', $3, $4)`,
        [
          userId,
          points,
          `Weekly workout challenge completed: ${challenge.title}`,
          `weekly-challenge:${challenge.id}`
        ]
      );

      await client.query(
        `UPDATE workout.weekly_challenges
         SET current_progress = $1,
             status = 'completed',
             completed_at = CURRENT_TIMESTAMP,
             points_awarded = TRUE
         WHERE id = $2`,
        [target, challenge.id]
      );

      completedChallenges.push({
        challenge_id: challenge.id,
        title: challenge.title,
        difficulty: challenge.difficulty,
        points_awarded: points
      });
    }

    await client.query('COMMIT');

    return completedChallenges;

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  getWeeklyChallenges,
  updateProgressFromWorkoutLog
};