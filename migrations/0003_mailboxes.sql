CREATE TABLE IF NOT EXISTS mailboxes (
  id TEXT PRIMARY KEY,
  address TEXT NOT NULL UNIQUE,
  local_part TEXT NOT NULL,
  domain TEXT NOT NULL,
  display_name TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS mailbox_deliveries (
  id TEXT PRIMARY KEY,
  mailbox_id TEXT NOT NULL REFERENCES mailboxes(id),
  message_id TEXT NOT NULL REFERENCES emails(id),
  folder TEXT NOT NULL CHECK (folder IN ('inbox', 'sent')),
  delivery_role TEXT CHECK (delivery_role IN ('to', 'cc', 'bcc')),
  delivered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS mailbox_deliveries_mailbox_message_folder_uidx
  ON mailbox_deliveries (mailbox_id, message_id, folder);

CREATE INDEX IF NOT EXISTS mailbox_deliveries_mailbox_folder_delivered_idx
  ON mailbox_deliveries (mailbox_id, folder, delivered_at DESC, message_id DESC);

CREATE INDEX IF NOT EXISTS emails_provider_message_id_idx
  ON emails (provider_message_id);

INSERT OR IGNORE INTO mailboxes (id, address, local_part, domain, display_name)
VALUES
  ('mailbox_inbox_brightex_cc', 'inbox@brightex.cc', 'inbox', 'brightex.cc', 'Inbox'),
  ('mailbox_tom_brightex_cc', 'tom@brightex.cc', 'tom', 'brightex.cc', 'Tom'),
  ('mailbox_jerry_brightex_cc', 'jerry@brightex.cc', 'jerry', 'brightex.cc', 'Jerry');
