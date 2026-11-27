SELECT column_name, data_type
FROM information_schema.columns
WHERE (table_schema = 'core' AND table_name = 'user_profiles')
   OR (table_schema = 'workout' AND table_name = 'user_workout_assessments')
ORDER BY table_schema, ordinal_position;
