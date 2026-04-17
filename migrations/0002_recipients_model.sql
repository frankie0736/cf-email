CREATE TABLE emails_v2 (
  id TEXT PRIMARY KEY,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  correlation_id TEXT NOT NULL,
  parent_id TEXT,
  source TEXT NOT NULL CHECK (source IN ('email_handler', 'auto_reply', 'http_api')),
  status TEXT NOT NULL CHECK (status IN ('received', 'pending', 'sent', 'failed')),
  provider_message_id TEXT,
  from_email TEXT NOT NULL,
  recipients_json TEXT NOT NULL,
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

INSERT INTO emails_v2 (
  id,
  direction,
  correlation_id,
  parent_id,
  source,
  status,
  provider_message_id,
  from_email,
  recipients_json,
  subject,
  text_body,
  html_body,
  envelope_from,
  envelope_to,
  raw_size,
  error_code,
  error_message,
  created_at,
  updated_at
)
SELECT
  id,
  direction,
  correlation_id,
  parent_id,
  source,
  status,
  provider_message_id,
  from_email,
  CASE
    WHEN TRIM(COALESCE(to_json, '')) = '' THEN '{"to":[],"cc":[],"bcc":[]}'
    ELSE '{"to":' || to_json || ',"cc":[],"bcc":[]}'
  END,
  subject,
  text_body,
  html_body,
  envelope_from,
  envelope_to,
  raw_size,
  error_code,
  error_message,
  created_at,
  updated_at
FROM emails;

DROP TABLE emails;

ALTER TABLE emails_v2 RENAME TO emails;

CREATE INDEX emails_created_at_idx ON emails (created_at DESC, id DESC);
CREATE INDEX emails_correlation_id_idx ON emails (correlation_id);
CREATE INDEX emails_parent_id_idx ON emails (parent_id);
