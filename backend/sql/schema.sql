-- ============================================================
-- NutriFit / Nutrition-Workout System — PostgreSQL Schema
-- Matches existing backend queries in src/modules/*
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. USERS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id              SERIAL PRIMARY KEY,
  email           VARCHAR(255) NOT NULL,
  password_hash   VARCHAR(255) NOT NULL,
  full_name       VARCHAR(255) NOT NULL,
  role            VARCHAR(50)  NOT NULL DEFAULT 'user',
  is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT users_email_unique UNIQUE (email),
  CONSTRAINT users_role_check CHECK (
    role IN ('user', 'admin', 'gym_manager', 'super_admin')
  )
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users (is_active);

-- ------------------------------------------------------------
-- 2. USER PROFILES
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_profiles (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER      NOT NULL,
  age             INTEGER,
  sex             VARCHAR(20),
  height_cm       NUMERIC(6,2),
  weight_kg       NUMERIC(6,2),
  activity_factor NUMERIC(4,2) DEFAULT 1.2,
  goal_type       VARCHAR(100),
  goal_category   VARCHAR(100),
  allergens       TEXT[]       DEFAULT '{}',
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT user_profiles_user_fk
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT user_profiles_user_unique UNIQUE (user_id),
  CONSTRAINT user_profiles_sex_check CHECK (
    sex IS NULL OR LOWER(sex) IN ('male', 'female', 'other')
  ),
  CONSTRAINT user_profiles_age_check CHECK (
    age IS NULL OR (age >= 10 AND age <= 120)
  ),
  CONSTRAINT user_profiles_height_check CHECK (
    height_cm IS NULL OR (height_cm > 0 AND height_cm < 300)
  ),
  CONSTRAINT user_profiles_weight_check CHECK (
    weight_kg IS NULL OR (weight_kg > 0 AND weight_kg < 500)
  )
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON user_profiles (user_id);

-- ------------------------------------------------------------
-- 3. LOYALTY POINTS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS loyalty_points (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER      NOT NULL,
  total_points    INTEGER      NOT NULL DEFAULT 0,
  lifetime_points INTEGER      NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT loyalty_points_user_fk
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT loyalty_points_user_unique UNIQUE (user_id),
  CONSTRAINT loyalty_points_total_check CHECK (total_points >= 0),
  CONSTRAINT loyalty_points_lifetime_check CHECK (lifetime_points >= 0)
);

CREATE INDEX IF NOT EXISTS idx_loyalty_points_user_id ON loyalty_points (user_id);

-- ------------------------------------------------------------
-- 4. LOYALTY TRANSACTIONS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER      NOT NULL,
  points        INTEGER      NOT NULL,
  type          VARCHAR(20)  NOT NULL,
  description   TEXT,
  reference_id  VARCHAR(255),
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT loyalty_transactions_user_fk
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT loyalty_transactions_type_check CHECK (
    type IN ('earn', 'redeem')
  )
);

CREATE INDEX IF NOT EXISTS idx_loyalty_tx_user_id ON loyalty_transactions (user_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_tx_reference ON loyalty_transactions (reference_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_tx_created ON loyalty_transactions (created_at DESC);

-- ------------------------------------------------------------
-- 5. FOODS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS foods (
  id             SERIAL PRIMARY KEY,
  name           VARCHAR(255) NOT NULL,
  brand          VARCHAR(255),
  serving_size   VARCHAR(100),
  calories       NUMERIC(10,2) NOT NULL DEFAULT 0,
  protein_g      NUMERIC(10,2) NOT NULL DEFAULT 0,
  carbs_g        NUMERIC(10,2) NOT NULL DEFAULT 0,
  fat_g          NUMERIC(10,2) NOT NULL DEFAULT 0,
  fiber_g        NUMERIC(10,2) NOT NULL DEFAULT 0,
  allergen_tags  TEXT[]        NOT NULL DEFAULT '{}',
  source         VARCHAR(100)  DEFAULT 'local',
  is_active      BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT foods_calories_check CHECK (calories >= 0),
  CONSTRAINT foods_protein_check  CHECK (protein_g >= 0),
  CONSTRAINT foods_carbs_check    CHECK (carbs_g >= 0),
  CONSTRAINT foods_fat_check      CHECK (fat_g >= 0),
  CONSTRAINT foods_fiber_check    CHECK (fiber_g >= 0)
);

-- Dedup helper: same name + brand (null brand treated as '')
CREATE UNIQUE INDEX IF NOT EXISTS idx_foods_name_brand_unique
  ON foods (LOWER(name), LOWER(COALESCE(brand, '')));

CREATE INDEX IF NOT EXISTS idx_foods_name ON foods (name);
CREATE INDEX IF NOT EXISTS idx_foods_is_active ON foods (is_active);
CREATE INDEX IF NOT EXISTS idx_foods_allergen_tags ON foods USING GIN (allergen_tags);

-- ------------------------------------------------------------
-- 6. EXERCISES
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS exercises (
  id             SERIAL PRIMARY KEY,
  name           VARCHAR(255) NOT NULL,
  muscle_group   VARCHAR(100),
  equipment      VARCHAR(255),
  difficulty     VARCHAR(50),
  default_sets   INTEGER,
  default_reps   VARCHAR(50),
  rest_seconds   INTEGER,
  common_errors  TEXT,
  form_tips      TEXT,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT exercises_difficulty_check CHECK (
    difficulty IS NULL OR difficulty IN ('Beginner', 'Intermediate', 'Advanced')
  ),
  CONSTRAINT exercises_sets_check CHECK (
    default_sets IS NULL OR default_sets > 0
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_exercises_name_muscle_unique
  ON exercises (LOWER(name), LOWER(COALESCE(muscle_group, '')));

CREATE INDEX IF NOT EXISTS idx_exercises_muscle ON exercises (muscle_group);
CREATE INDEX IF NOT EXISTS idx_exercises_difficulty ON exercises (difficulty);

-- ------------------------------------------------------------
-- 7. MEAL LOGS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS meal_logs (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER       NOT NULL,
  food_id     INTEGER       NOT NULL,
  meal_type   VARCHAR(50),
  quantity    NUMERIC(8,2)  NOT NULL DEFAULT 1,
  calories    NUMERIC(10,2) NOT NULL DEFAULT 0,
  protein_g   NUMERIC(10,2) NOT NULL DEFAULT 0,
  carbs_g     NUMERIC(10,2) NOT NULL DEFAULT 0,
  fat_g       NUMERIC(10,2) NOT NULL DEFAULT 0,
  log_date    DATE          NOT NULL DEFAULT CURRENT_DATE,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT meal_logs_user_fk
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT meal_logs_food_fk
    FOREIGN KEY (food_id) REFERENCES foods (id) ON DELETE RESTRICT,
  CONSTRAINT meal_logs_quantity_check CHECK (quantity > 0)
);

CREATE INDEX IF NOT EXISTS idx_meal_logs_user_date ON meal_logs (user_id, log_date);
CREATE INDEX IF NOT EXISTS idx_meal_logs_food_id ON meal_logs (food_id);

-- ------------------------------------------------------------
-- 8. HEALTH ACTIVITY LOGS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS health_activity_logs (
  id               SERIAL PRIMARY KEY,
  user_id          INTEGER       NOT NULL,
  steps            INTEGER       NOT NULL DEFAULT 0,
  active_calories  NUMERIC(10,2) NOT NULL DEFAULT 0,
  log_date         DATE          NOT NULL DEFAULT CURRENT_DATE,
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT health_activity_user_fk
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT health_activity_user_date_unique UNIQUE (user_id, log_date),
  CONSTRAINT health_activity_steps_check CHECK (steps >= 0),
  CONSTRAINT health_activity_calories_check CHECK (active_calories >= 0)
);

CREATE INDEX IF NOT EXISTS idx_health_activity_user_date
  ON health_activity_logs (user_id, log_date DESC);

-- ------------------------------------------------------------
-- 9. MINIGAME QUIZZES
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS minigame_quizzes (
  id             SERIAL PRIMARY KEY,
  exercise_id    INTEGER,
  question       TEXT         NOT NULL,
  options        JSONB        NOT NULL,
  correct_index  INTEGER      NOT NULL,
  explanation    TEXT,
  points_reward  INTEGER      NOT NULL DEFAULT 5,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT minigame_quizzes_exercise_fk
    FOREIGN KEY (exercise_id) REFERENCES exercises (id) ON DELETE SET NULL,
  CONSTRAINT minigame_quizzes_correct_check CHECK (correct_index >= 0),
  CONSTRAINT minigame_quizzes_points_check CHECK (points_reward >= 0)
);

CREATE INDEX IF NOT EXISTS idx_minigame_quizzes_exercise
  ON minigame_quizzes (exercise_id);

COMMIT;