-- ============================================================
-- Migration: Support custom / AI-generated meals in meal_logs
-- Safe to run multiple times
-- ============================================================

BEGIN;

ALTER TABLE meal_logs
  ALTER COLUMN food_id DROP NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'meal_logs_food_fk'
      AND table_name = 'meal_logs'
  ) THEN
    ALTER TABLE meal_logs DROP CONSTRAINT meal_logs_food_fk;
  END IF;
END $$;

ALTER TABLE meal_logs
  ADD CONSTRAINT meal_logs_food_fk
  FOREIGN KEY (food_id) REFERENCES foods (id) ON DELETE SET NULL;

ALTER TABLE meal_logs
  ADD COLUMN IF NOT EXISTS food_name   VARCHAR(255),
  ADD COLUMN IF NOT EXISTS source      VARCHAR(50)  NOT NULL DEFAULT 'food_catalog',
  ADD COLUMN IF NOT EXISTS notes       TEXT,
  ADD COLUMN IF NOT EXISTS custom_items JSONB;

UPDATE meal_logs ml
SET food_name = f.name
FROM foods f
WHERE ml.food_id = f.id
  AND (ml.food_name IS NULL OR ml.food_name = '');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'meal_logs_source_check'
  ) THEN
    ALTER TABLE meal_logs
      ADD CONSTRAINT meal_logs_source_check
      CHECK (source IN ('food_catalog', 'ai_generated', 'custom'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'meal_logs_identity_check'
  ) THEN
    ALTER TABLE meal_logs
      ADD CONSTRAINT meal_logs_identity_check
      CHECK (food_id IS NOT NULL OR (food_name IS NOT NULL AND length(trim(food_name)) > 0));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_meal_logs_source ON meal_logs (source);
CREATE INDEX IF NOT EXISTS idx_meal_logs_food_name ON meal_logs (food_name);

COMMIT;