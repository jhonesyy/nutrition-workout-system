SELECT
    table_schema,
    table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name ILIKE '%exercise%'
   OR table_name ILIKE '%video%'
   OR table_name ILIKE '%workout%'
ORDER BY table_schema, table_name, ordinal_position;
