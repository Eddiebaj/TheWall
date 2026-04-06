CREATE TABLE api_logs (
  id BIGSERIAL PRIMARY KEY,
  endpoint TEXT NOT NULL,
  stop_id TEXT,
  source TEXT,
  latency_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_api_logs_created_at ON api_logs (created_at DESC);
