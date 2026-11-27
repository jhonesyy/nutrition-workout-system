ALTER TABLE workout.user_workout_assessments
ADD COLUMN IF NOT EXISTS mobility_test_completed_at TIMESTAMPTZ;
