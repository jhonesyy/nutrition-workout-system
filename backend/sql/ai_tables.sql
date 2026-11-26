-- Tables referenced by ai.controller / aiChatService but missing from schema.sql.
-- Safe to run multiple times.

BEGIN;

CREATE TABLE IF NOT EXISTS ai_conversations (
  id               BIGSERIAL    PRIMARY KEY,
  user_id          INTEGER      NOT NULL,
  conversation_id  UUID         NOT NULL,
  role             VARCHAR(20)  NOT NULL,
  message          TEXT         NOT NULL,
  metadata         JSONB        NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT ai_conversations_user_fk
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT ai_conversations_role_check
    CHECK (role IN ('user', 'assistant', 'system'))
);

CREATE INDEX IF NOT EXISTS idx_ai_conv_user_conv
  ON ai_conversations (user_id, conversation_id, created_at);

CREATE TABLE IF NOT EXISTS generated_meal_plans (
  id               SERIAL        PRIMARY KEY,
  user_id          INTEGER       NOT NULL,
  goal_type        VARCHAR(100),
  goal_category    VARCHAR(100),
  target_calories  NUMERIC(10,2),
  protein_g        NUMERIC(10,2),
  carbs_g          NUMERIC(10,2),
  fat_g            NUMERIC(10,2),
  allergens        TEXT[]        NOT NULL DEFAULT '{}',
  plan_data        JSONB         NOT NULL,
  is_public        BOOLEAN       NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT generated_meal_plans_user_fk
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_generated_meal_plans_user
  ON generated_meal_plans (user_id, created_at DESC);

COMMIT;