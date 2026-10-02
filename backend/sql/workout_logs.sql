BEGIN;

CREATE TABLE IF NOT EXISTS workout_logs (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exercise_id     INTEGER REFERENCES exercises(id) ON DELETE SET NULL,
  exercise_name   VARCHAR(255),
  sets_completed  INTEGER,
  reps_completed  VARCHAR(50),
  weight_kg       NUMERIC(8,2),
  duration_minutes INTEGER,
  notes           TEXT,
  log_date        DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT workout_logs_sets_check CHECK (sets_completed IS NULL OR sets_completed > 0)
);

CREATE INDEX IF NOT EXISTS idx_workout_logs_user_date
  ON workout_logs (user_id, log_date DESC);

CREATE INDEX IF NOT EXISTS idx_workout_logs_exercise
  ON workout_logs (exercise_id);

COMMIT;