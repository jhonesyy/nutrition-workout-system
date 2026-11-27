SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'core'
  AND table_name = 'user_profiles'
ORDER BY ordinal_position;
