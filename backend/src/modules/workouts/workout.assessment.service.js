const pool = require('../../config/db');

const EXPERIENCE_LEVELS = ['beginner', 'intermediate', 'advanced'];

const ACTIVITY_LEVELS = [
  'sedentary',
  'lightly_active',
  'moderately_active',
  'very_active',
  'extra_active'
];

const MOVEMENT_ABILITIES = [
  'able',
  'unable',
  'prefer_not_to_attempt'
];

const toOptionalInteger = (value, field, min, max = Number.MAX_SAFE_INTEGER) => {
  if (value === undefined || value === null || value === '') return null;

  const number = Number(value);

  if (!Number.isInteger(number) || number < min || number > max) {
    throw new Error(`${field} must be an integer between ${min} and ${max}`);
  }

  return number;
};

const toOptionalString = (value, field, maxLength) => {
  if (value === undefined || value === null || value === '') return null;

  if (typeof value !== 'string') {
    throw new Error(`${field} must be a string`);
  }

  const normalized = value.trim();

  if (!normalized) return null;

  if (normalized.length > maxLength) {
    throw new Error(`${field} cannot exceed ${maxLength} characters`);
  }

  return normalized;
};

const toStringArray = (value, field) => {
  if (value === undefined || value === null) return [];

  if (!Array.isArray(value)) {
    throw new Error(`${field} must be an array`);
  }

  return value.map((item) => {
    if (typeof item !== 'string' || !item.trim()) {
      throw new Error(`${field} must contain non-empty strings`);
    }

    return item.trim();
  });
};

// Validate movement answers without hard-coding the library's movement keys.
// This also preserves compatibility with previously saved screening answers.
const validateMovementScreening = (value) => {
  if (value === undefined || value === null) return {};

  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('movement_screening must be an object');
  }

  const normalized = {};

  for (const [key, answer] of Object.entries(value)) {
    if (!/^[a-z0-9_]{1,80}$/.test(key)) {
      throw new Error(`Invalid movement screening field: ${key}`);
    }

    if (!answer || typeof answer !== 'object' || Array.isArray(answer)) {
      throw new Error(`${key} must contain an ability and pain answer`);
    }

    if (!MOVEMENT_ABILITIES.includes(answer.ability)) {
      throw new Error(
        `${key}.ability must be able, unable, or prefer_not_to_attempt`
      );
    }

    const skipsPain = answer.ability === 'prefer_not_to_attempt';

    if (skipsPain) {
      if (answer.pain !== null && typeof answer.pain !== 'boolean') {
        throw new Error(`${key}.pain must be true, false, or null`);
      }
    } else if (typeof answer.pain !== 'boolean') {
      throw new Error(`${key}.pain must be true or false`);
    }

    normalized[key] = {
      ability: answer.ability,
      pain: skipsPain ? null : answer.pain
    };
  }

  return normalized;
};

const getWorkoutAssessment = async (userId) => {
  const result = await pool.query(
    `SELECT *
     FROM workout.user_workout_assessments
     WHERE user_id = $1`,
    [userId]
  );

  return result.rows[0] || null;
};

// TRAINING QUESTIONNAIRE
const saveWorkoutAssessment = async (userId, data) => {
  const trainingExperience = toOptionalString(
    data.training_experience,
    'training_experience',
    30
  );

  const trainingAgeMonths = toOptionalInteger(
    data.training_age_months,
    'training_age_months',
    0
  );

  const workoutDays = toOptionalInteger(
    data.workout_days_per_week,
    'workout_days_per_week',
    2,
    6
  );

  const sessionDuration = toOptionalInteger(
    data.session_duration_minutes,
    'session_duration_minutes',
    30,
    120
  );

  const availableEquipment = toStringArray(
    data.available_equipment,
    'available_equipment'
  );

  let hasInjuries = data.has_injuries;

  if (
    hasInjuries !== undefined &&
    hasInjuries !== null &&
    typeof hasInjuries !== 'boolean'
  ) {
    throw new Error('has_injuries must be true or false');
  }

  if (hasInjuries === undefined) {
    hasInjuries = null;
  }

  const injuredBodyParts = toStringArray(
    data.injured_body_parts,
    'injured_body_parts'
  );

  const injuryDetails = toOptionalString(
    data.injury_details,
    'injury_details',
    5000
  );

  const activityLevel = toOptionalString(
    data.activity_level,
    'activity_level',
    30
  );

  const workoutGoal = toOptionalString(
    data.workout_goal,
    'workout_goal',
    100
  );

  const hasMovementScreening =
    data.movement_screening !== undefined &&
    data.movement_screening !== null;

  const movementScreening = validateMovementScreening(
    data.movement_screening
  );

  const painLocations = toStringArray(
    data.pain_locations,
    'pain_locations'
  );

  const movementLimitations = toOptionalString(
    data.movement_limitations,
    'movement_limitations',
    5000
  );

  if (
    trainingExperience &&
    !EXPERIENCE_LEVELS.includes(trainingExperience.toLowerCase())
  ) {
    throw new Error('Invalid training_experience');
  }

  if (
    activityLevel &&
    !ACTIVITY_LEVELS.includes(activityLevel.toLowerCase())
  ) {
    throw new Error('Invalid activity_level');
  }

  const normalizedExperience = trainingExperience?.toLowerCase() || null;
  const normalizedActivity = activityLevel?.toLowerCase() || null;

  const isComplete = Boolean(
    normalizedExperience &&
    trainingAgeMonths !== null &&
    workoutDays !== null &&
    sessionDuration !== null &&
    availableEquipment.length > 0 &&
    hasInjuries !== null &&
    normalizedActivity &&
    workoutGoal
  );

  const status = isComplete ? 'completed' : 'incomplete';

  const result = await pool.query(
    `INSERT INTO workout.user_workout_assessments (
       user_id,
       training_experience,
       training_age_months,
       workout_days_per_week,
       session_duration_minutes,
       available_equipment,
       has_injuries,
       injured_body_parts,
       injury_details,
       activity_level,
       workout_goal,
       movement_screening,
       pain_locations,
       movement_limitations,
       assessment_status,
       completed_at,
       updated_at
     )
     VALUES (
       $1::integer,
       $2::varchar(30),
       $3::integer,
       $4::integer,
       $5::integer,
       $6::text[],
       $7::boolean,
       $8::text[],
       $9::text,
       $10::varchar(30),
       $11::varchar(100),
       $12::jsonb,
       $13::text[],
       $14::text,
       $15::varchar(20),
       $16::timestamptz,
       NOW()
     )
     ON CONFLICT (user_id)
     DO UPDATE SET
       training_experience = EXCLUDED.training_experience,
       training_age_months = EXCLUDED.training_age_months,
       workout_days_per_week = EXCLUDED.workout_days_per_week,
       session_duration_minutes = EXCLUDED.session_duration_minutes,
       available_equipment = EXCLUDED.available_equipment,
       has_injuries = EXCLUDED.has_injuries,
       injured_body_parts = EXCLUDED.injured_body_parts,
       injury_details = EXCLUDED.injury_details,
       activity_level = EXCLUDED.activity_level,
       workout_goal = EXCLUDED.workout_goal,
       movement_screening = CASE
         WHEN $17::boolean
         THEN EXCLUDED.movement_screening
         ELSE user_workout_assessments.movement_screening
       END,
       pain_locations = EXCLUDED.pain_locations,
       movement_limitations = EXCLUDED.movement_limitations,
       assessment_status = EXCLUDED.assessment_status,
       completed_at = EXCLUDED.completed_at,
       updated_at = NOW()
     RETURNING *`,
    [
      userId,
      normalizedExperience,
      trainingAgeMonths,
      workoutDays,
      sessionDuration,
      availableEquipment,
      hasInjuries,
      injuredBodyParts,
      injuryDetails,
      normalizedActivity,
      workoutGoal,
      JSON.stringify(movementScreening),
      painLocations,
      movementLimitations,
      status,
      isComplete ? new Date() : null,
      hasMovementScreening
    ]
  );

  return result.rows[0];
};

// MOBILITY TEST - uses the active database movement library.
const saveMobilityTest = async (userId, data) => {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Invalid mobility test data');
  }

  const movementScreening = validateMovementScreening(
    data.movement_screening
  );

  const activeResult = await pool.query(
    `SELECT movement_key
     FROM workout.mobility_test_movements
     WHERE is_active = TRUE
     ORDER BY sort_order ASC, id ASC`
  );

  const activeKeys = activeResult.rows.map(
    (movement) => movement.movement_key
  );

  if (!activeKeys.length) {
    throw new Error('No active mobility movements are available');
  }

  const missing = activeKeys.filter(
    (key) => !movementScreening[key]
  );

  if (missing.length) {
    throw new Error(
      `Complete all active mobility checks: ${missing.join(', ')}`
    );
  }

  const unknown = Object.keys(movementScreening).filter(
    (key) => !activeKeys.includes(key)
  );

  if (unknown.length) {
    throw new Error(
      `These movements are not currently active: ${unknown.join(', ')}`
    );
  }

  const result = await pool.query(
    `INSERT INTO workout.user_workout_assessments (
       user_id,
       movement_screening,
       mobility_test_completed_at,
       updated_at
     )
     VALUES (
       $1::integer,
       $2::jsonb,
       NOW(),
       NOW()
     )
     ON CONFLICT (user_id)
     DO UPDATE SET
       movement_screening = EXCLUDED.movement_screening,
       mobility_test_completed_at = NOW(),
       updated_at = NOW()
     RETURNING *`,
    [
      userId,
      JSON.stringify(movementScreening)
    ]
  );

  return result.rows[0];
};

module.exports = {
  getWorkoutAssessment,
  saveWorkoutAssessment,
  saveMobilityTest
};


