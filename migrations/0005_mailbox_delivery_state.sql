ALTER TABLE mailboxes
  ADD COLUMN kind TEXT NOT NULL DEFAULT 'local';

ALTER TABLE mailboxes
  ADD COLUMN sendable INTEGER NOT NULL DEFAULT 1;

INSERT OR IGNORE INTO mailboxes (
  id,
  address,
  local_part,
  domain,
  display_name,
  kind,
  sendable
)
VALUES (
  'mailbox_unknown_recipients',
  '__unknown__',
  '__unknown__',
  '',
  '未知收件人',
  'virtual',
  0
);

DROP INDEX IF EXISTS mailbox_deliveries_mailbox_message_folder_uidx;
DROP INDEX IF EXISTS mailbox_deliveries_mailbox_folder_delivered_idx;

CREATE TABLE mailbox_deliveries_v2 (
  id TEXT PRIMARY KEY,
  mailbox_id TEXT NOT NULL REFERENCES mailboxes(id),
  message_id TEXT NOT NULL REFERENCES emails(id),
  folder TEXT NOT NULL CHECK (folder IN ('inbox', 'sent')),
  delivery_role TEXT CHECK (delivery_role IN ('to', 'cc', 'bcc')),
  mailbox_address TEXT NOT NULL,
  read_at TEXT,
  deleted_at TEXT,
  delivered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO mailbox_deliveries_v2 (
  id,
  mailbox_id,
  message_id,
  folder,
  delivery_role,
  mailbox_address,
  read_at,
  deleted_at,
  delivered_at
)
SELECT
  d.id,
  d.mailbox_id,
  d.message_id,
  d.folder,
  d.delivery_role,
  m.address,
  CASE WHEN d.folder = 'sent' THEN d.delivered_at ELSE NULL END,
  NULL,
  d.delivered_at
FROM mailbox_deliveries d
JOIN mailboxes m ON m.id = d.mailbox_id;

DROP TABLE mailbox_deliveries;

ALTER TABLE mailbox_deliveries_v2
  RENAME TO mailbox_deliveries;

CREATE UNIQUE INDEX mailbox_deliveries_mailbox_message_folder_address_uidx
  ON mailbox_deliveries (mailbox_id, message_id, folder, mailbox_address);

CREATE INDEX mailbox_deliveries_mailbox_folder_visible_delivered_idx
  ON mailbox_deliveries (mailbox_id, folder, deleted_at, delivered_at DESC, message_id DESC);

CREATE INDEX mailbox_deliveries_message_visible_idx
  ON mailbox_deliveries (message_id, deleted_at);
