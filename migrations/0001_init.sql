CREATE TABLE IF NOT EXISTS emails (
  id TEXT PRIMARY KEY,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  correlation_id TEXT NOT NULL,
  parent_id TEXT,
  source TEXT NOT NULL CHECK (source IN ('email_handler', 'auto_reply', 'http_api')),
  status TEXT NOT NULL CHECK (status IN ('received', 'pending', 'sent', 'failed')),
  provider_message_id TEXT,
  from_email TEXT NOT NULL,
  to_json TEXT NOT NULL,
  subject TEXT NOT NULL,
  text_body TEXT,
  html_body TEXT,
  envelope_from TEXT,
  envelope_to TEXT,
  raw_size INTEGER,
  error_code TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS emails_created_at_idx ON emails (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS emails_correlation_id_idx ON emails (correlation_id);
CREATE INDEX IF NOT EXISTS emails_parent_id_idx ON emails (parent_id);
