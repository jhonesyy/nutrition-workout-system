SELECT
    conname,
    contype,
    pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'workout.user_workout_assessments'::regclass;

SELECT
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'workout'
  AND tablename = 'user_workout_assessments';
