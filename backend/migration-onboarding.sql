BEGIN;

-- FOOD AND EATING PREFERENCES
ALTER TABLE core.user_profiles
    ADD COLUMN IF NOT EXISTS liked_foods TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS disliked_foods TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS dietary_preferences TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS dietary_restrictions TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS food_spice_preference VARCHAR(20),
    ADD COLUMN IF NOT EXISTS usual_meal_frequency INTEGER,
    ADD COLUMN IF NOT EXISTS food_budget_per_day NUMERIC(10,2),
    ADD COLUMN IF NOT EXISTS food_preferences_notes TEXT;

-- MOVEMENT SCREENING
ALTER TABLE workout.user_workout_assessments
    ADD COLUMN IF NOT EXISTS movement_screening JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS pain_locations TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS movement_limitations TEXT;

-- VALIDATE FOOD PREFERENCE VALUES
ALTER TABLE core.user_profiles
    ADD CONSTRAINT profile_spice_preference_check
    CHECK (
        food_spice_preference IS NULL
        OR food_spice_preference IN ('mild', 'medium', 'spicy', 'no_preference')
    );

ALTER TABLE core.user_profiles
    ADD CONSTRAINT profile_meal_frequency_check
    CHECK (
        usual_meal_frequency IS NULL
        OR usual_meal_frequency BETWEEN 1 AND 8
    );

ALTER TABLE core.user_profiles
    ADD CONSTRAINT profile_food_budget_check
    CHECK (
        food_budget_per_day IS NULL
        OR food_budget_per_day >= 0
    );

COMMIT;
