SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'workout'
  AND table_name = 'exercises'
ORDER BY ordinal_position;
