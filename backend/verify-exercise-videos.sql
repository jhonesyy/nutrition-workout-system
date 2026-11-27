SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'workout'
  AND table_name = 'exercises'
  AND column_name IN (
    'video_url',
    'video_public_id',
    'video_duration_seconds',
    'video_bytes',
    'video_format'
  )
ORDER BY ordinal_position;
