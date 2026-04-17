CREATE TABLE IF NOT EXISTS email_attachments (
  id TEXT PRIMARY KEY,
  email_id TEXT NOT NULL REFERENCES emails(id),
  storage_key TEXT NOT NULL UNIQUE,
  filename TEXT,
  content_type TEXT NOT NULL,
  disposition TEXT NOT NULL CHECK (disposition IN ('attachment', 'inline')),
  content_id TEXT,
  size INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS email_attachments_email_created_idx
  ON email_attachments (email_id, created_at ASC, id ASC);
