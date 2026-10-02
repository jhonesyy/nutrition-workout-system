BEGIN;

-- Gym profile (single row for now)
CREATE TABLE IF NOT EXISTS gym_settings (
  id              SERIAL PRIMARY KEY,
  name            VARCHAR(255) NOT NULL DEFAULT 'House of Strength GYM',
  address         TEXT,
  contact_number  VARCHAR(50),
  operating_hours VARCHAR(255),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Seed default if empty
INSERT INTO gym_settings (name, address)
SELECT 'House of Strength GYM', '238 Cableway Calumpang, Binangonan, Rizal'
WHERE NOT EXISTS (SELECT 1 FROM gym_settings);

-- Redeemable rewards
CREATE TABLE IF NOT EXISTS rewards (
  id              SERIAL PRIMARY KEY,
  name            VARCHAR(255) NOT NULL,
  points_required INTEGER NOT NULL,
  description     TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT rewards_points_check CHECK (points_required > 0)
);

CREATE INDEX IF NOT EXISTS idx_rewards_active ON rewards (is_active);

COMMIT;