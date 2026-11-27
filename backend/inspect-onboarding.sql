SELECT table_schema, table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name IN ('user_profiles', 'user_workout_assessments')
ORDER BY table_schema, table_name, ordinal_position;
