SELECT
    table_schema,
    table_name,
    column_name,
    data_type
FROM information_schema.columns
WHERE
    (table_schema = 'workout')
    OR
    (table_schema = 'nutrition')
    OR
    (table_schema = 'core' AND table_name IN ('users', 'user_profiles', 'user_health_constraints'))
ORDER BY table_schema, table_name, ordinal_position;
