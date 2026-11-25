-- Table to store AI provider usage metrics
CREATE TABLE IF NOT EXISTS ai_provider_metrics (
    provider VARCHAR(50) PRIMARY KEY, -- 'custom', 'groq', 'gemini'
    request_count BIGINT DEFAULT 0,
    error_count BIGINT DEFAULT 0,
    total_response_time_ms BIGINT DEFAULT 0,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Initialize metrics for the three providers
INSERT INTO ai_provider_metrics (provider) 
VALUES ('custom'), ('groq'), ('gemini')
ON CONFLICT (provider) DO NOTHING;

-- Table to store global AI configuration
CREATE TABLE IF NOT EXISTS ai_config (
    config_key VARCHAR(50) PRIMARY KEY,
    config_value TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Initialize default configuration
INSERT INTO ai_config (config_key, config_value) 
VALUES 
    ('default_provider', 'custom'),
    ('enabled_providers', 'custom,groq,gemini')
ON CONFLICT (config_key) DO UPDATE SET config_value = EXCLUDED.config_value;