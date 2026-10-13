-- NutriFit dataset storage migration
-- Keeps source-specific fields needed by the food/workout recommenders.
-- Safe to run more than once.

BEGIN;

-- FOODS
ALTER TABLE foods
  ADD COLUMN IF NOT EXISTS external_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS alternate_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS saturated_fat_g NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sodium_mg NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cholesterol_mg NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS water_g NUMERIC(10,2) NOT NULL DEFAULT 0;

-- Existing schema's name+brand index does not fit the FCT dataset:
-- same English food can have multiple Filipino variants.
DROP INDEX IF EXISTS idx_foods_name_brand_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_foods_external_id_unique
  ON foods (external_id)
  WHERE external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_foods_alternate_name
  ON foods (alternate_name);

-- EXERCISES
ALTER TABLE exercises
  ADD COLUMN IF NOT EXISTS external_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS force VARCHAR(50),
  ADD COLUMN IF NOT EXISTS mechanic VARCHAR(50),
  ADD COLUMN IF NOT EXISTS secondary_muscles TEXT,
  ADD COLUMN IF NOT EXISTS category VARCHAR(100);

CREATE UNIQUE INDEX IF NOT EXISTS idx_exercises_external_id_unique
  ON exercises (external_id)
  WHERE external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_exercises_category
  ON exercises (category);

CREATE INDEX IF NOT EXISTS idx_exercises_equipment
  ON exercises (equipment);

COMMIT;
