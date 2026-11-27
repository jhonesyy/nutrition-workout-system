ALTER TABLE workout.exercises
  ADD COLUMN IF NOT EXISTS video_url TEXT,
  ADD COLUMN IF NOT EXISTS video_public_id TEXT,
  ADD COLUMN IF NOT EXISTS video_duration_seconds INTEGER,
  ADD COLUMN IF NOT EXISTS video_bytes BIGINT,
  ADD COLUMN IF NOT EXISTS video_format VARCHAR(20);

ALTER TABLE workout.exercises
  DROP CONSTRAINT IF EXISTS exercises_video_duration_check;

ALTER TABLE workout.exercises
  ADD CONSTRAINT exercises_video_duration_check
  CHECK (
    video_duration_seconds IS NULL
    OR video_duration_seconds >= 0
  );

ALTER TABLE workout.exercises
  DROP CONSTRAINT IF EXISTS exercises_video_bytes_check;

ALTER TABLE workout.exercises
  ADD CONSTRAINT exercises_video_bytes_check
  CHECK (
    video_bytes IS NULL
    OR video_bytes >= 0
  );
