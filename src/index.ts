import PostalMime from "postal-mime";
import type { Attachment as ParsedAttachment, Email } from "postal-mime";
import { findRejectedOutboundRecipients } from "./outbound-allowlist";
import { renderAppHtml } from "./ui";

type EmailDirection = "inbound" | "outbound";
type EmailStatus = "failed" | "pending" | "received" | "sent";
type EmailSource = "auto_reply" | "email_handler" | "http_api";
type AttachmentDisposition = "attachment" | "inline";
type MailboxFolder = "inbox" | "sent";
type RecipientRole = "bcc" | "cc" | "to";

interface EmailRecipients {
  bcc: string[];
  cc: string[];
  to: string[];
}

interface SendEmailResult {
  messageId?: string;
}

interface SendEmailAttachment {
  content: string | ArrayBuffer;
  contentId?: string;
  disposition: AttachmentDisposition;
  filename: string;
  type: string;
}

interface SendEmailBinding {
  send(message: SendEmailRequest): Promise<SendEmailResult>;
}

interface SendEmailRequest {
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  from: string | { email: string; name: string };
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string | { email: string; name: string };
  attachments?: SendEmailAttachment[];
  headers?: Record<string, string>;
}

interface Env {
  APP_NAME?: string;
  AUTO_REPLY_ENABLED?: string;
  ATTACHMENTS: R2Bucket;
  DB: D1Database;
  MAIL_FROM: string;
  SEND_EMAIL: SendEmailBinding;
}

interface ForwardableEmailMessage {
  from: string;
  to: string;
  headers: Headers;
  raw: ReadableStream<Uint8Array>;
  rawSize?: number;
}

interface MailboxRecord {
  id: string;
  address: string;
  localPart: string;
  domain: string;
  displayName: string | null;
  kind: "local" | "virtual";
  sendable: boolean;
  createdAt: string;
}

interface MailboxRow {
  id: string;
  address: string;
  local_part: string;
  domain: string;
  display_name: string | null;
  kind: "local" | "virtual";
  sendable: number;
  created_at: string;
}

interface EmailAttachmentRecord {
  id: string;
  contentId: string | null;
  contentType: string;
  createdAt: string;
  disposition: AttachmentDisposition;
  downloadPath: string;
  emailId: string;
  filename: string | null;
  size: number;
}

interface StoredEmailAttachmentRecord extends EmailAttachmentRecord {
  storageKey: string;
}

interface EmailAttachmentRow {
  id: string;
  email_id: string;
  storage_key: string;
  filename: string | null;
  content_type: string;
  disposition: AttachmentDisposition;
  content_id: string | null;
  size: number;
  created_at: string;
}

interface EmailRecord {
  attachments: EmailAttachmentRecord[];
  id: string;
  direction: EmailDirection;
  correlationId: string;
  parentId: string | null;
  source: EmailSource;
  status: EmailStatus;
  providerMessageId: string | null;
  fromEmail: string;
  recipients: EmailRecipients;
  subject: string;
  textBody: string | null;
  htmlBody: string | null;
  envelopeFrom: string | null;
  envelopeTo: string | null;
  rawSize: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

interface MailboxEmailRecord extends EmailRecord {
  deliveryId: string;
  deliveredAt: string;
  deliveryRole: RecipientRole | null;
  folder: MailboxFolder;
  isRead: boolean;
  mailboxAddress: string;
  mailboxId: string;
  readAt: string | null;
}

interface EmailRow {
  id: string;
  direction: EmailDirection;
  correlation_id: string;
  parent_id: string | null;
  source: EmailSource;
  status: EmailStatus;
  provider_message_id: string | null;
  from_email: string;
  recipients_json: string;
  subject: string;
  text_body: string | null;
  html_body: string | null;
  envelope_from: string | null;
  envelope_to: string | null;
  raw_size: number | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

interface MailboxEmailRow extends EmailRow {
  delivery_id: string;
  delivered_at: string;
  delivery_role: RecipientRole | null;
  folder: MailboxFolder;
  mailbox_address: string;
  mailbox_id: string;
  read_at: string | null;
}

interface SendPayload {
  to?: unknown;
  cc?: unknown;
  bcc?: unknown;
  subject?: unknown;
  text?: unknown;
  html?: unknown;
  from?: unknown;
  replyTo?: unknown;
}

interface ReadStatePayload {
  read?: unknown;
}

interface OutboundDraft {
  attachments: DraftAttachmentInput[];
  correlationId: string;
  parentId: string | null;
  source: EmailSource;
  recipients: EmailRecipients;
  from: string;
  subject: string;
  textBody: string | null;
  htmlBody: string | null;
  replyTo?: string;
  headers?: Record<string, string>;
}

interface DraftAttachmentInput {
  bytes: Uint8Array;
  contentId: string | null;
  contentType: string;
  disposition: AttachmentDisposition;
  filename: string;
}

const ATTACHMENT_BUCKET_PREFIX = "emails";
const DEFAULT_LIST_LIMIT = 20;
const MAX_TOTAL_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const MAX_TOTAL_RECIPIENTS = 50;
const MAX_LIST_LIMIT = 100;
const NO_SUBJECT = "(no subject)";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const UNKNOWN_RECIPIENT_MAILBOX_ADDRESS = "__unknown__";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const correlationId =
      request.headers.get("x-correlation-id") ?? `req_${crypto.randomUUID()}`;
    const url = new URL(request.url);

    logInfo("http.request", {
      correlationId,
      method: request.method,
      path: url.pathname,
    });

    try {
      if (request.method === "GET" && url.pathname === "/") {
        return html(
          renderAppHtml({
            appName: env.APP_NAME ?? "brightex.cc mailbox",
            mailFrom: env.MAIL_FROM,
            autoReplyEnabled: isTruthy(env.AUTO_REPLY_ENABLED),
          }),
        );
      }

      if (request.method === "GET" && url.pathname === "/api") {
        return json({
          ok: true,
          appName: env.APP_NAME ?? "brightex.cc mailbox",
          mailFrom: env.MAIL_FROM,
          autoReplyEnabled: isTruthy(env.AUTO_REPLY_ENABLED),
          endpoints: {
            ui: "GET /",
            health: "GET /health",
            downloadAttachment: "GET /api/attachments/:id",
            listMailboxes: "GET /api/mailboxes",
            listEmails: "GET /api/emails?limit=20&mailbox=inbox@brightex.cc&direction=inbound|outbound",
            getEmail: "GET /api/emails/:id",
            deleteDelivery: "DELETE /api/deliveries/:id",
            setReadState: "POST /api/deliveries/:id/read",
            send: "POST /api/send",
          },
        });
      }

      if (request.method === "GET" && url.pathname === "/health") {
        return json({ ok: true, correlationId });
      }

      if (request.method === "GET" && url.pathname === "/api/mailboxes") {
        const mailboxes = await listMailboxes(env.DB);
        return json({
          ok: true,
          correlationId,
          items: mailboxes,
        });
      }

      if (request.method === "GET" && url.pathname === "/api/emails") {
        const limit = clampLimit(url.searchParams.get("limit"));
        const direction = parseDirection(url.searchParams.get("direction"));
        const mailboxAddress = normalizeMailboxSelector(url.searchParams.get("mailbox"));
        const emails = mailboxAddress
          ? await listMailboxEmails(env.DB, mailboxAddress, limit, direction)
          : await listEmails(env.DB, limit, direction);
        return json({
          ok: true,
          correlationId,
          items: emails,
        });
      }

      if (request.method === "GET" && url.pathname.startsWith("/api/emails/")) {
        const id = url.pathname.slice("/api/emails/".length).trim();
        if (!id) {
          return json({ ok: false, error: "missing email id" }, 400);
        }

        const email = await getEmailById(env.DB, id);
        if (!email) {
          return json({ ok: false, error: "email not found" }, 404);
        }

        return json({
          ok: true,
          correlationId,
          item: email,
        });
      }

      if (request.method === "POST" && url.pathname.startsWith("/api/deliveries/")) {
        const match = matchDeliveryPath(url.pathname, "/api/deliveries/", "/read");
        if (match) {
          const payload = await readJson<ReadStatePayload>(request);
          const read = normalizeRequiredBoolean(payload.read, "read");
          const item = await setMailboxDeliveryReadState(env.DB, match.deliveryId, read);
          return json({
            ok: true,
            correlationId,
            item,
          });
        }
      }

      if (request.method === "DELETE" && url.pathname.startsWith("/api/deliveries/")) {
        const match = matchDeliveryPath(url.pathname, "/api/deliveries/");
        if (match) {
          await softDeleteMailboxDelivery(env.DB, match.deliveryId);
          return json({
            ok: true,
            correlationId,
            deletedDeliveryId: match.deliveryId,
          });
        }
      }

      if (request.method === "GET" && url.pathname.startsWith("/api/attachments/")) {
        const id = url.pathname.slice("/api/attachments/".length).trim();
        if (!id) {
          return json({ ok: false, error: "missing attachment id" }, 400);
        }

        const attachment = await getStoredAttachmentById(env.DB, id);
        if (!attachment) {
          return json({ ok: false, error: "attachment not found" }, 404);
        }

        const object = await env.ATTACHMENTS.get(attachment.storageKey);
        if (!object?.body) {
          return json({ ok: false, error: "attachment content missing" }, 404);
        }

        return attachmentResponse(object, attachment);
      }

      if (request.method === "POST" && url.pathname === "/api/send") {
        const draft = await readSendDraft(request, env, correlationId);
        const outbound = await sendAndStore(env, draft);

        return json(
          {
            ok: true,
            correlationId,
            item: outbound,
          },
          201,
        );
      }

      return json({ ok: false, error: "not found" }, 404);
    } catch (error) {
      const normalized = normalizeError(error);
      logError("http.error", {
        correlationId,
        path: url.pathname,
        code: normalized.code,
        message: normalized.message,
      });

      return json(
        {
          ok: false,
          correlationId,
          code: normalized.code ?? "INTERNAL_ERROR",
          error: normalized.message,
        },
        normalized.statusCode,
      );
    }
  },

  async email(message: ForwardableEmailMessage, env: Env): Promise<void> {
    const correlationId = toCorrelationId(message.headers.get("message-id"));
    const raw = await new Response(message.raw).arrayBuffer();
    const parsed = await PostalMime.parse(raw);
    const inbound = toInboundRecord(message, parsed, correlationId, raw.byteLength);
    const existingInbound = inbound.providerMessageId
      ? await getInboundEmailByProviderMessageId(env.DB, inbound.providerMessageId)
      : null;
    const storedInbound = existingInbound ?? inbound;

    if (!existingInbound) {
      await insertEmail(env.DB, inbound);
      await storeParsedAttachments(env, inbound.id, parsed.attachments);
    }

    const deliveryCount = await ensureInboundMailboxDeliveries(
      env.DB,
      storedInbound,
      normalizeEmail(message.to),
    );

    logInfo("email.inbound.received", {
      correlationId,
      emailId: storedInbound.id,
      from: storedInbound.fromEmail,
      recipients: storedInbound.recipients,
      subject: storedInbound.subject,
      attachmentCount: existingInbound ? undefined : parsed.attachments.length,
      mailboxDeliveryCount: deliveryCount,
      deduped: Boolean(existingInbound),
    });

    if (deliveryCount === 0) {
      logInfo("email.inbound.ignored", {
        correlationId,
        emailId: storedInbound.id,
        reason: "no-local-mailbox-delivery",
      });
      return;
    }

    if (existingInbound) {
      return;
    }

    if (!isTruthy(env.AUTO_REPLY_ENABLED)) {
      return;
    }

    if (!shouldSendAutoReply(storedInbound.fromEmail, message.to, message.headers)) {
      logInfo("email.auto_reply.skipped", {
        correlationId,
        from: storedInbound.fromEmail,
        reason: "automated-or-loop-prone-sender",
      });
      return;
    }

    const replyFrom = normalizeEmail(message.to) ?? env.MAIL_FROM;
    const originalMessageId = message.headers.get("message-id");
    const replyDraft: OutboundDraft = {
      correlationId,
      parentId: storedInbound.id,
      source: "auto_reply",
      attachments: [],
      from: replyFrom,
      recipients: {
        to: [storedInbound.fromEmail],
        cc: [],
        bcc: [],
      },
      subject: buildReplySubject(storedInbound.subject),
      textBody: buildAutoReplyText(
        env.APP_NAME ?? "brightex.cc mailbox",
        message.to,
        storedInbound.subject,
        correlationId,
      ),
      htmlBody: null,
      headers: threadHeaders(originalMessageId, correlationId),
    };

    await sendAndStore(env, replyDraft);
  },
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}

function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
    },
  });
}

function attachmentResponse(
  object: R2ObjectBody,
  attachment: StoredEmailAttachmentRecord,
): Response {
  const filename = safeAttachmentFilename(attachment);

  return new Response(object.body, {
    headers: {
      "cache-control": "no-store",
      "content-disposition": `attachment; filename="${escapeHeaderFilename(filename)}"`,
      "content-length": String(attachment.size),
      "content-type": attachment.contentType,
    },
  });
}

async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw httpError(400, "INVALID_JSON", "request body must be valid JSON");
  }
}

async function readSendDraft(
  request: Request,
  env: Env,
  correlationId: string,
): Promise<OutboundDraft> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    return toFormDraft(formData, env, correlationId);
  }

  const payload = await readJson<SendPayload>(request);
  return toHttpDraft(payload, env, correlationId);
}

function toHttpDraft(payload: SendPayload, env: Env, correlationId: string): OutboundDraft {
  const recipients = normalizeRecipientsInput(
    {
      to: payload.to,
      cc: payload.cc,
      bcc: payload.bcc,
    },
    { requireTo: true },
  );
  const subject = normalizeSubject(payload.subject);
  const textBody = normalizeOptionalString(payload.text);
  const htmlBody = normalizeOptionalString(payload.html);

  if (!textBody && !htmlBody) {
    throw httpError(400, "BODY_REQUIRED", "either text or html is required");
  }

  const from = normalizeEmail(
    typeof payload.from === "string" ? payload.from : env.MAIL_FROM,
  );

  if (!from) {
    throw httpError(400, "INVALID_FROM", "from must be a valid email address");
  }

  const replyTo = normalizeOptionalEmail(payload.replyTo, "replyTo");

  return {
    attachments: [],
    correlationId,
    parentId: null,
    source: "http_api",
    from,
    recipients,
    subject,
    textBody,
    htmlBody,
    replyTo: replyTo ?? undefined,
  };
}

async function toFormDraft(
  formData: FormData,
  env: Env,
  correlationId: string,
): Promise<OutboundDraft> {
  const recipients = normalizeRecipientsInput(
    {
      to: formData.get("to"),
      cc: formData.get("cc"),
      bcc: formData.get("bcc"),
    },
    { requireTo: true },
  );
  const subject = normalizeSubject(formData.get("subject"));
  const textBody = normalizeOptionalString(formData.get("text"));
  const htmlBody = normalizeOptionalString(formData.get("html"));

  if (!textBody && !htmlBody) {
    throw httpError(400, "BODY_REQUIRED", "either text or html is required");
  }

  const from = normalizeEmail(
    typeof formData.get("from") === "string" ? String(formData.get("from")) : env.MAIL_FROM,
  );
  if (!from) {
    throw httpError(400, "INVALID_FROM", "from must be a valid email address");
  }

  const replyTo = normalizeOptionalEmail(formData.get("replyTo"), "replyTo");
  const attachments = await normalizeDraftAttachments(formData.getAll("attachments"));

  return {
    attachments,
    correlationId,
    parentId: null,
    source: "http_api",
    from,
    recipients,
    subject,
    textBody,
    htmlBody,
    replyTo: replyTo ?? undefined,
  };
}

function toInboundRecord(
  message: ForwardableEmailMessage,
  parsed: Email,
  correlationId: string,
  rawSize: number,
): EmailRecord {
  const headerFrom = parsed.from?.address?.trim();
  const recipients = normalizeRecipientsInput(
    {
      to: extractParsedAddresses(parsed.to),
      cc: extractParsedAddresses(parsed.cc),
      bcc: extractParsedAddresses(parsed.bcc),
    },
    { allowEmpty: true },
  );

  return {
    attachments: [],
    id: crypto.randomUUID(),
    direction: "inbound",
    correlationId,
    parentId: null,
    source: "email_handler",
    status: "received",
    providerMessageId: trimToNull(message.headers.get("message-id")),
    fromEmail: normalizeRequiredEmail(headerFrom ?? message.from, "from"),
    recipients,
    subject: normalizeSubject(parsed.subject),
    textBody: trimToNull(parsed.text ?? null),
    htmlBody: normalizeHtml(parsed.html),
    envelopeFrom: normalizeEmail(message.from),
    envelopeTo: normalizeEmail(message.to),
    rawSize,
    errorCode: null,
    errorMessage: null,
    createdAt: "",
    updatedAt: "",
  };
}

async function sendAndStore(env: Env, draft: OutboundDraft): Promise<EmailRecord> {
  assertOutboundRecipientsAllowed(draft.recipients);

  const record: EmailRecord = {
    attachments: [],
    id: crypto.randomUUID(),
    direction: "outbound",
    correlationId: draft.correlationId,
    parentId: draft.parentId,
    source: draft.source,
    status: "pending",
    providerMessageId: null,
    fromEmail: draft.from,
    recipients: draft.recipients,
    subject: draft.subject,
    textBody: draft.textBody,
    htmlBody: draft.htmlBody,
    envelopeFrom: draft.from,
    envelopeTo: flattenRecipients(draft.recipients).join(","),
    rawSize: null,
    errorCode: null,
    errorMessage: null,
    createdAt: "",
    updatedAt: "",
  };

  await insertEmail(env.DB, record);

  try {
    await storeDraftAttachments(env, record.id, draft.attachments);

    const response = await env.SEND_EMAIL.send({
      attachments: draft.attachments.map(toSendEmailAttachment),
      to: draft.recipients.to,
      cc: toOptionalRecipientValue(draft.recipients.cc),
      bcc: toOptionalRecipientValue(draft.recipients.bcc),
      from: draft.from,
      subject: draft.subject,
      text: draft.textBody ?? undefined,
      html: draft.htmlBody ?? undefined,
      replyTo: draft.replyTo,
      headers: draft.headers,
    });

    const providerMessageId = normalizeProviderMessageId(response, record.id);
    await markEmailSent(env.DB, record.id, providerMessageId);
    await ensureSentMailboxDelivery(env.DB, record.id, draft.from);

    logInfo("email.outbound.sent", {
      correlationId: draft.correlationId,
      attachmentCount: draft.attachments.length,
      emailId: record.id,
      providerMessageId,
      from: draft.from,
      recipients: draft.recipients,
      subject: draft.subject,
    });

    const stored = await getEmailById(env.DB, record.id);
    if (!stored) {
      throw new Error(`email ${record.id} disappeared after send`);
    }

    return stored;
  } catch (error) {
    const normalized = normalizeError(error);
    await markEmailFailed(env.DB, record.id, normalized.code, normalized.message);

    logError("email.outbound.failed", {
      correlationId: draft.correlationId,
      emailId: record.id,
      code: normalized.code,
      message: normalized.message,
    });

    throw error;
  }
}

async function insertEmail(db: D1Database, record: EmailRecord): Promise<void> {
  await db
    .prepare(
      `
        INSERT INTO emails (
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
          error_message
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .bind(
      record.id,
      record.direction,
      record.correlationId,
      record.parentId,
      record.source,
      record.status,
      record.providerMessageId,
      record.fromEmail,
      JSON.stringify(record.recipients),
      record.subject,
      record.textBody,
      record.htmlBody,
      record.envelopeFrom,
      record.envelopeTo,
      record.rawSize,
      record.errorCode,
      record.errorMessage,
    )
    .run();
}

async function markEmailSent(
  db: D1Database,
  id: string,
  providerMessageId: string,
): Promise<void> {
  await db
    .prepare(
      `
        UPDATE emails
        SET
          status = 'sent',
          provider_message_id = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
    )
    .bind(providerMessageId, id)
    .run();
}

async function markEmailFailed(
  db: D1Database,
  id: string,
  code: string | null,
  message: string,
): Promise<void> {
  await db
    .prepare(
      `
        UPDATE emails
        SET
          status = 'failed',
          error_code = ?,
          error_message = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
    )
    .bind(code, message, id)
    .run();
}

async function listEmails(
  db: D1Database,
  limit: number,
  direction: EmailDirection | null,
): Promise<EmailRecord[]> {
  if (!direction) {
    const result = await db
      .prepare(
        `
          SELECT *
          FROM emails
          ORDER BY created_at DESC, id DESC
          LIMIT ?
        `,
      )
      .bind(limit)
      .all<EmailRow>();

    return attachAttachmentsToEmails(db, result.results.map(fromRow));
  }

  const result = await db
    .prepare(
      `
        SELECT *
        FROM emails
        WHERE direction = ?
        ORDER BY created_at DESC, id DESC
        LIMIT ?
      `,
    )
    .bind(direction, limit)
    .all<EmailRow>();

  return attachAttachmentsToEmails(db, result.results.map(fromRow));
}

async function listMailboxEmails(
  db: D1Database,
  mailboxAddress: string,
  limit: number,
  direction: EmailDirection | null,
): Promise<MailboxEmailRecord[]> {
  const mailbox = await getMailboxByAddress(db, mailboxAddress);
  if (!mailbox) {
    throw httpError(404, "MAILBOX_NOT_FOUND", `mailbox not found: ${mailboxAddress}`);
  }

  const baseQuery = `
    SELECT
      e.*,
      d.id AS delivery_id,
      d.delivered_at,
      d.delivery_role,
      d.folder,
      d.mailbox_address,
      m.id AS mailbox_id,
      d.read_at
    FROM mailbox_deliveries d
    JOIN emails e ON e.id = d.message_id
    JOIN mailboxes m ON m.id = d.mailbox_id
    WHERE d.mailbox_id = ?
      AND d.deleted_at IS NULL
  `;

  if (!direction) {
    const result = await db
      .prepare(
        `
          ${baseQuery}
          ORDER BY d.delivered_at DESC, e.created_at DESC, e.id DESC
          LIMIT ?
        `,
      )
      .bind(mailbox.id, limit)
      .all<MailboxEmailRow>();

    return attachAttachmentsToMailboxEmails(db, result.results.map(fromMailboxEmailRow));
  }

  const result = await db
    .prepare(
      `
        ${baseQuery}
        AND e.direction = ?
        ORDER BY d.delivered_at DESC, e.created_at DESC, e.id DESC
        LIMIT ?
      `,
    )
    .bind(mailbox.id, direction, limit)
    .all<MailboxEmailRow>();

  return attachAttachmentsToMailboxEmails(db, result.results.map(fromMailboxEmailRow));
}

async function getEmailById(db: D1Database, id: string): Promise<EmailRecord | null> {
  const row = await db
    .prepare(
      `
        SELECT *
        FROM emails
        WHERE id = ?
        LIMIT 1
      `,
    )
    .bind(id)
    .first<EmailRow>();

  if (!row) {
    return null;
  }

  const [email] = await attachAttachmentsToEmails(db, [fromRow(row)]);
  return email ?? null;
}

async function getInboundEmailByProviderMessageId(
  db: D1Database,
  providerMessageId: string,
): Promise<EmailRecord | null> {
  const row = await db
    .prepare(
      `
        SELECT *
        FROM emails
        WHERE direction = 'inbound' AND provider_message_id = ?
        LIMIT 1
      `,
    )
    .bind(providerMessageId)
    .first<EmailRow>();

  if (!row) {
    return null;
  }

  const [email] = await attachAttachmentsToEmails(db, [fromRow(row)]);
  return email ?? null;
}

async function getMailboxEmailByDeliveryId(
  db: D1Database,
  deliveryId: string,
): Promise<MailboxEmailRecord | null> {
  const row = await db
    .prepare(
      `
        SELECT
          e.*,
          d.id AS delivery_id,
          d.delivered_at,
          d.delivery_role,
          d.folder,
          d.mailbox_address,
          d.read_at,
          m.id AS mailbox_id
        FROM mailbox_deliveries d
        JOIN emails e ON e.id = d.message_id
        JOIN mailboxes m ON m.id = d.mailbox_id
        WHERE d.id = ?
          AND d.deleted_at IS NULL
        LIMIT 1
      `,
    )
    .bind(deliveryId)
    .first<MailboxEmailRow>();

  if (!row) {
    return null;
  }

  const [email] = await attachAttachmentsToMailboxEmails(db, [fromMailboxEmailRow(row)]);
  return email ?? null;
}

async function setMailboxDeliveryReadState(
  db: D1Database,
  deliveryId: string,
  read: boolean,
): Promise<MailboxEmailRecord> {
  const updateQuery = read
    ? `
        UPDATE mailbox_deliveries
        SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
        WHERE id = ? AND deleted_at IS NULL
      `
    : `
        UPDATE mailbox_deliveries
        SET read_at = NULL
        WHERE id = ? AND deleted_at IS NULL
      `;

  await db.prepare(updateQuery).bind(deliveryId).run();

  const item = await getMailboxEmailByDeliveryId(db, deliveryId);
  if (!item) {
    throw httpError(404, "DELIVERY_NOT_FOUND", `mailbox delivery not found: ${deliveryId}`);
  }

  return item;
}

async function softDeleteMailboxDelivery(
  db: D1Database,
  deliveryId: string,
): Promise<void> {
  await db
    .prepare(
      `
        UPDATE mailbox_deliveries
        SET deleted_at = CURRENT_TIMESTAMP
        WHERE id = ? AND deleted_at IS NULL
      `,
    )
    .bind(deliveryId)
    .run();

  const existing = await db
    .prepare(
      `
        SELECT id
        FROM mailbox_deliveries
        WHERE id = ?
        LIMIT 1
      `,
    )
    .bind(deliveryId)
    .first<{ id: string }>();

  if (!existing) {
    throw httpError(404, "DELIVERY_NOT_FOUND", `mailbox delivery not found: ${deliveryId}`);
  }
}

async function getStoredAttachmentById(
  db: D1Database,
  id: string,
): Promise<StoredEmailAttachmentRecord | null> {
  const row = await db
    .prepare(
      `
        SELECT *
        FROM email_attachments
        WHERE id = ?
        LIMIT 1
      `,
    )
    .bind(id)
    .first<EmailAttachmentRow>();

  return row ? fromAttachmentRow(row) : null;
}

async function attachAttachmentsToEmails<T extends EmailRecord>(
  db: D1Database,
  emails: T[],
): Promise<T[]> {
  if (emails.length === 0) {
    return emails;
  }

  const attachmentMap = await listAttachmentMapByEmailIds(
    db,
    emails.map((email) => email.id),
  );

  return emails.map((email) => ({
    ...email,
    attachments: attachmentMap.get(email.id) ?? [],
  }));
}

async function attachAttachmentsToMailboxEmails(
  db: D1Database,
  emails: MailboxEmailRecord[],
): Promise<MailboxEmailRecord[]> {
  return attachAttachmentsToEmails(db, emails);
}

async function listAttachmentMapByEmailIds(
  db: D1Database,
  emailIds: string[],
): Promise<Map<string, EmailAttachmentRecord[]>> {
  const normalized = unique(emailIds);
  const map = new Map<string, EmailAttachmentRecord[]>();

  if (normalized.length === 0) {
    return map;
  }

  const placeholders = normalized.map(() => "?").join(", ");
  const result = await db
    .prepare(
      `
        SELECT *
        FROM email_attachments
        WHERE email_id IN (${placeholders})
        ORDER BY created_at ASC, id ASC
      `,
    )
    .bind(...normalized)
    .all<EmailAttachmentRow>();

  for (const row of result.results) {
    const attachment = toPublicAttachment(fromAttachmentRow(row));
    const items = map.get(attachment.emailId);
    if (items) {
      items.push(attachment);
      continue;
    }
    map.set(attachment.emailId, [attachment]);
  }

  return map;
}

async function listMailboxes(db: D1Database): Promise<MailboxRecord[]> {
  const result = await db
    .prepare(
      `
        SELECT *
        FROM mailboxes
        ORDER BY sendable DESC, address ASC
      `,
    )
    .all<MailboxRow>();

  return result.results.map(fromMailboxRow);
}

async function listLocalMailboxes(db: D1Database): Promise<MailboxRecord[]> {
  const result = await db
    .prepare(
      `
        SELECT *
        FROM mailboxes
        WHERE kind = 'local'
        ORDER BY address ASC
      `,
    )
    .all<MailboxRow>();

  return result.results.map(fromMailboxRow);
}

async function getMailboxByAddress(
  db: D1Database,
  address: string,
): Promise<MailboxRecord | null> {
  const row = await db
    .prepare(
      `
        SELECT *
        FROM mailboxes
        WHERE address = ?
        LIMIT 1
      `,
    )
    .bind(address)
    .first<MailboxRow>();

  return row ? fromMailboxRow(row) : null;
}

async function listMailboxesByAddresses(
  db: D1Database,
  addresses: string[],
): Promise<MailboxRecord[]> {
  const normalized = unique(
    addresses.map((item) => normalizeEmail(item)).filter((item): item is string => Boolean(item)),
  );
  if (normalized.length === 0) {
    return [];
  }

  const placeholders = normalized.map(() => "?").join(", ");
  const result = await db
    .prepare(
      `
        SELECT *
        FROM mailboxes
        WHERE kind = 'local'
          AND address IN (${placeholders})
        ORDER BY address ASC
      `,
    )
    .bind(...normalized)
    .all<MailboxRow>();

  return result.results.map(fromMailboxRow);
}

async function ensureInboundMailboxDeliveries(
  db: D1Database,
  email: EmailRecord,
  envelopeTo: string | null,
): Promise<number> {
  const localMailboxes = await listLocalMailboxes(db);
  const candidateAddresses = unique([
    ...flattenRecipients(email.recipients),
    ...(envelopeTo ? [envelopeTo] : []),
  ]);
  const knownAddresses = new Set(localMailboxes.map((mailbox) => mailbox.address));
  const localDomains = new Set(
    localMailboxes.map((mailbox) => mailbox.domain).filter((domain) => domain.length > 0),
  );
  const mailboxes = localMailboxes.filter((mailbox) => candidateAddresses.includes(mailbox.address));
  const unknownAddresses = listUnknownRecipientAddresses(email, knownAddresses, localDomains);
  const unknownMailbox = await getMailboxByAddress(db, UNKNOWN_RECIPIENT_MAILBOX_ADDRESS);

  let inserted = 0;
  for (const mailbox of mailboxes) {
    const role = inferDeliveryRole(email.recipients, mailbox.address, envelopeTo);
    inserted += await insertMailboxDelivery(db, {
      mailboxId: mailbox.id,
      mailboxAddress: mailbox.address,
      messageId: email.id,
      folder: "inbox",
      deliveryRole: role,
      readAt: null,
    });
  }

  if (!unknownMailbox) {
    return inserted;
  }

  for (const mailboxAddress of unknownAddresses) {
    inserted += await insertMailboxDelivery(db, {
      mailboxId: unknownMailbox.id,
      mailboxAddress,
      messageId: email.id,
      folder: "inbox",
      deliveryRole: inferDeliveryRole(email.recipients, mailboxAddress, envelopeTo),
      readAt: null,
    });
  }

  return inserted;
}

async function ensureSentMailboxDelivery(
  db: D1Database,
  messageId: string,
  fromAddress: string,
): Promise<void> {
  const mailbox = await getMailboxByAddress(db, fromAddress);
  if (!mailbox || !mailbox.sendable) {
    return;
  }

  await insertMailboxDelivery(db, {
    mailboxId: mailbox.id,
    mailboxAddress: fromAddress,
    messageId,
    folder: "sent",
    deliveryRole: null,
    readAt: new Date().toISOString(),
  });
}

async function insertMailboxDelivery(
  db: D1Database,
  input: {
    mailboxId: string;
    mailboxAddress: string;
    messageId: string;
    folder: MailboxFolder;
    deliveryRole: RecipientRole | null;
    readAt: string | null;
  },
): Promise<number> {
  const existing = await db
    .prepare(
      `
        SELECT id
        FROM mailbox_deliveries
        WHERE mailbox_id = ? AND message_id = ? AND folder = ? AND mailbox_address = ?
        LIMIT 1
      `,
    )
    .bind(input.mailboxId, input.messageId, input.folder, input.mailboxAddress)
    .first<{ id: string }>();

  if (existing) {
    return 0;
  }

  await db
    .prepare(
      `
        INSERT OR IGNORE INTO mailbox_deliveries (
          id,
          mailbox_id,
          message_id,
          folder,
          delivery_role,
          mailbox_address,
          read_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .bind(
      crypto.randomUUID(),
      input.mailboxId,
      input.messageId,
      input.folder,
      input.deliveryRole,
      input.mailboxAddress,
      input.readAt,
    )
    .run();

  return 1;
}

async function storeParsedAttachments(
  env: Env,
  emailId: string,
  attachments: ParsedAttachment[],
): Promise<void> {
  for (const attachment of attachments) {
    await storeAttachment(env, emailId, {
      bytes: toAttachmentBytes(attachment.content),
      contentId: trimToNull(attachment.contentId ?? null),
      contentType: normalizeAttachmentContentType(attachment.mimeType),
      disposition: normalizeAttachmentDisposition(attachment.disposition),
      filename: normalizeAttachmentFilename(attachment.filename),
    });
  }
}

async function storeDraftAttachments(
  env: Env,
  emailId: string,
  attachments: DraftAttachmentInput[],
): Promise<void> {
  for (const attachment of attachments) {
    await storeAttachment(env, emailId, attachment);
  }
}

async function storeAttachment(
  env: Env,
  emailId: string,
  attachment: DraftAttachmentInput,
): Promise<void> {
  const id = crypto.randomUUID();
  const filename = normalizeAttachmentFilename(attachment.filename);
  const storageKey = buildAttachmentStorageKey(emailId, id, filename);

  await env.ATTACHMENTS.put(storageKey, attachment.bytes, {
    httpMetadata: {
      contentType: attachment.contentType,
    },
  });

  try {
    await insertAttachmentMetadata(env.DB, {
      id,
      emailId,
      storageKey,
      filename,
      contentType: attachment.contentType,
      disposition: attachment.disposition,
      contentId: attachment.contentId,
      size: attachment.bytes.byteLength,
    });
  } catch (error) {
    await env.ATTACHMENTS.delete(storageKey);
    throw error;
  }
}

async function insertAttachmentMetadata(
  db: D1Database,
  input: {
    id: string;
    emailId: string;
    storageKey: string;
    filename: string;
    contentType: string;
    disposition: AttachmentDisposition;
    contentId: string | null;
    size: number;
  },
): Promise<void> {
  await db
    .prepare(
      `
        INSERT INTO email_attachments (
          id,
          email_id,
          storage_key,
          filename,
          content_type,
          disposition,
          content_id,
          size
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .bind(
      input.id,
      input.emailId,
      input.storageKey,
      input.filename,
      input.contentType,
      input.disposition,
      input.contentId,
      input.size,
    )
    .run();
}

function fromRow(row: EmailRow): EmailRecord {
  return {
    attachments: [],
    id: row.id,
    direction: row.direction,
    correlationId: row.correlation_id,
    parentId: row.parent_id,
    source: row.source,
    status: row.status,
    providerMessageId: row.provider_message_id,
    fromEmail: row.from_email,
    recipients: parseRecipientsJson(row.recipients_json),
    subject: row.subject,
    textBody: row.text_body,
    htmlBody: row.html_body,
    envelopeFrom: row.envelope_from,
    envelopeTo: row.envelope_to,
    rawSize: row.raw_size,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function fromAttachmentRow(row: EmailAttachmentRow): StoredEmailAttachmentRecord {
  return {
    id: row.id,
    emailId: row.email_id,
    storageKey: row.storage_key,
    filename: row.filename,
    contentType: row.content_type,
    disposition: row.disposition,
    contentId: row.content_id,
    size: row.size,
    createdAt: row.created_at,
    downloadPath: attachmentDownloadPath(row.id),
  };
}

function toPublicAttachment(
  attachment: StoredEmailAttachmentRecord,
): EmailAttachmentRecord {
  return {
    id: attachment.id,
    emailId: attachment.emailId,
    filename: attachment.filename,
    contentType: attachment.contentType,
    disposition: attachment.disposition,
    contentId: attachment.contentId,
    size: attachment.size,
    createdAt: attachment.createdAt,
    downloadPath: attachment.downloadPath,
  };
}

function fromMailboxEmailRow(row: MailboxEmailRow): MailboxEmailRecord {
  return {
    ...fromRow(row),
    deliveryId: row.delivery_id,
    deliveredAt: row.delivered_at,
    deliveryRole: row.delivery_role,
    folder: row.folder,
    isRead: row.read_at !== null,
    mailboxAddress: row.mailbox_address,
    mailboxId: row.mailbox_id,
    readAt: row.read_at,
  };
}

function fromMailboxRow(row: MailboxRow): MailboxRecord {
  return {
    id: row.id,
    address: row.address,
    localPart: row.local_part,
    domain: row.domain,
    displayName: row.display_name,
    kind: row.kind,
    sendable: row.sendable === 1,
    createdAt: row.created_at,
  };
}

function listUnknownRecipientAddresses(
  email: EmailRecord,
  knownAddresses: Set<string>,
  localDomains: Set<string>,
): string[] {
  return unique(
    [
      ...(email.envelopeTo ? [email.envelopeTo] : []),
      ...flattenRecipients(email.recipients),
    ].filter((address): address is string => {
      const domain = getEmailDomain(address);
      return domain !== null && localDomains.has(domain) && !knownAddresses.has(address);
    }),
  );
}

function inferDeliveryRole(
  recipients: EmailRecipients,
  mailboxAddress: string,
  envelopeTo: string | null,
): RecipientRole | null {
  if (recipients.to.includes(mailboxAddress)) {
    return "to";
  }
  if (recipients.cc.includes(mailboxAddress)) {
    return "cc";
  }
  if (recipients.bcc.includes(mailboxAddress)) {
    return "bcc";
  }
  if (envelopeTo === mailboxAddress) {
    return "bcc";
  }
  return null;
}

function parseDirection(value: string | null): EmailDirection | null {
  if (!value) {
    return null;
  }
  if (value === "inbound" || value === "outbound") {
    return value;
  }
  throw httpError(400, "INVALID_DIRECTION", "direction must be inbound or outbound");
}

function clampLimit(value: string | null): number {
  if (!value) {
    return DEFAULT_LIST_LIMIT;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw httpError(400, "INVALID_LIMIT", "limit must be a positive integer");
  }
  return Math.min(parsed, MAX_LIST_LIMIT);
}

function normalizeRecipientsInput(
  value: Partial<Record<RecipientRole, unknown>>,
  options: { allowEmpty?: boolean; requireTo?: boolean } = {},
): EmailRecipients {
  const recipients = normalizeRecipientsShape({
    to: normalizeRecipientField(value.to, "to"),
    cc: normalizeRecipientField(value.cc, "cc"),
    bcc: normalizeRecipientField(value.bcc, "bcc"),
  });
  const total = countRecipients(recipients);

  if (options.requireTo && recipients.to.length === 0) {
    throw httpError(400, "INVALID_RECIPIENT", "to must contain at least one email");
  }

  if (!options.allowEmpty && total === 0) {
    throw httpError(400, "INVALID_RECIPIENT", "at least one recipient is required");
  }

  if (total > MAX_TOTAL_RECIPIENTS) {
    throw httpError(
      400,
      "TOO_MANY_RECIPIENTS",
      `total recipients must be <= ${MAX_TOTAL_RECIPIENTS}`,
    );
  }

  return recipients;
}

function normalizeRecipientField(value: unknown, field: RecipientRole): string[] {
  if (value === null || value === undefined) {
    return [];
  }

  const inputs = Array.isArray(value) ? value : [value];
  const normalized: string[] = [];

  for (const input of inputs) {
    if (typeof input !== "string") {
      throw httpError(
        400,
        "INVALID_RECIPIENT",
        `${field} must be a string or string array`,
      );
    }

    for (const token of splitRecipientInput(input)) {
      const email = normalizeEmail(token);
      if (!email) {
        throw httpError(400, "INVALID_RECIPIENT", `${field} contains invalid email: ${token}`);
      }
      normalized.push(email);
    }
  }

  return unique(normalized);
}

function splitRecipientInput(value: string): string[] {
  return value
    .split(/[\n,;]+/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeRecipientsShape(value: Partial<EmailRecipients>): EmailRecipients {
  const seen = new Set<string>();
  const recipients: EmailRecipients = {
    to: [],
    cc: [],
    bcc: [],
  };

  for (const role of ["to", "cc", "bcc"] as RecipientRole[]) {
    const source = value[role] ?? [];
    for (const email of source) {
      if (!seen.has(email)) {
        recipients[role].push(email);
        seen.add(email);
      }
    }
  }

  return recipients;
}

function parseRecipientsJson(value: string): EmailRecipients {
  const parsed = JSON.parse(value) as Partial<Record<RecipientRole, unknown>>;
  return normalizeRecipientsShape({
    to: normalizeStoredRecipientField(parsed.to, "to"),
    cc: normalizeStoredRecipientField(parsed.cc, "cc"),
    bcc: normalizeStoredRecipientField(parsed.bcc, "bcc"),
  });
}

function normalizeStoredRecipientField(value: unknown, field: RecipientRole): string[] {
  if (value === null || value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error(`stored ${field} recipients must be an array`);
  }

  const normalized = value.map((item) => {
    if (typeof item !== "string") {
      throw new Error(`stored ${field} recipients must contain strings`);
    }
    const email = normalizeEmail(item);
    if (!email) {
      throw new Error(`stored ${field} recipients contains invalid email: ${item}`);
    }
    return email;
  });

  return unique(normalized);
}

function extractParsedAddresses(value: Email["to"] | Email["cc"] | Email["bcc"]): string[] {
  return unique(
    (value ?? [])
      .map((item) => normalizeEmail(item.address))
      .filter((item): item is string => Boolean(item)),
  );
}

function flattenRecipients(recipients: EmailRecipients): string[] {
  return [...recipients.to, ...recipients.cc, ...recipients.bcc];
}

function assertOutboundRecipientsAllowed(recipients: EmailRecipients): void {
  const rejected = findRejectedOutboundRecipients(flattenRecipients(recipients));
  if (rejected.length === 0) {
    return;
  }

  throw httpError(
    403,
    "RECIPIENT_NOT_ALLOWED",
    `outbound recipients are not allowed: ${rejected.join(", ")}`,
  );
}

function countRecipients(recipients: EmailRecipients): number {
  return flattenRecipients(recipients).length;
}

function toOptionalRecipientValue(values: string[]): string | string[] | undefined {
  if (values.length === 0) {
    return undefined;
  }
  return values;
}

function toSendEmailAttachment(attachment: DraftAttachmentInput): SendEmailAttachment {
  return {
    content: bytesToBase64(attachment.bytes),
    contentId: attachment.contentId ?? undefined,
    disposition: attachment.disposition,
    filename: attachment.filename,
    type: attachment.contentType,
  };
}

function normalizeSubject(value: unknown): string {
  if (typeof value !== "string") {
    return NO_SUBJECT;
  }

  const subject = value.trim();
  return subject.length > 0 ? subject : NO_SUBJECT;
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeRequiredBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw httpError(400, "INVALID_BOOLEAN", `${field} must be a boolean`);
  }
  return value;
}

async function normalizeDraftAttachments(
  values: FormDataEntryValue[],
): Promise<DraftAttachmentInput[]> {
  const attachments = (
    await Promise.all(values.map((value) => normalizeDraftAttachment(value)))
  ).filter((item): item is DraftAttachmentInput => Boolean(item));
  const totalBytes = attachments.reduce((sum, item) => sum + item.bytes.byteLength, 0);

  if (totalBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
    throw httpError(
      400,
      "ATTACHMENTS_TOO_LARGE",
      `total attachments must be <= ${MAX_TOTAL_ATTACHMENT_BYTES} bytes`,
    );
  }

  return attachments;
}

async function normalizeDraftAttachment(
  value: FormDataEntryValue,
): Promise<DraftAttachmentInput | null> {
  if (typeof value === "string") {
    if (value.trim() === "") {
      return null;
    }
    throw httpError(400, "INVALID_ATTACHMENT", "attachments must be uploaded files");
  }

  if (value.size === 0 && value.name.trim() === "") {
    return null;
  }

  return {
    bytes: new Uint8Array(await value.arrayBuffer()),
    contentId: null,
    contentType: normalizeAttachmentContentType(value.type),
    disposition: "attachment",
    filename: normalizeAttachmentFilename(value.name),
  };
}

function normalizeOptionalEmail(value: unknown, field: string): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = normalizeEmail(value);
  if (!normalized) {
    throw httpError(400, "INVALID_EMAIL", `${field} must be a valid email`);
  }

  return normalized;
}

function normalizeAttachmentContentType(value: string | null | undefined): string {
  const normalized = trimToNull(value);
  return normalized ?? "application/octet-stream";
}

function normalizeAttachmentDisposition(
  value: ParsedAttachment["disposition"] | null | undefined,
): AttachmentDisposition {
  return value === "inline" ? "inline" : "attachment";
}

function normalizeAttachmentFilename(value: string | null | undefined): string {
  const fallback = "attachment.bin";
  const normalized = trimToNull(value);
  if (!normalized) {
    return fallback;
  }

  const safe = normalized
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "_")
    .replace(/\s+/g, " ")
    .trim();

  return safe.length > 0 ? safe : fallback;
}

function normalizeMailboxSelector(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed === UNKNOWN_RECIPIENT_MAILBOX_ADDRESS) {
    return UNKNOWN_RECIPIENT_MAILBOX_ADDRESS;
  }

  const normalized = normalizeEmail(trimmed);
  if (!normalized) {
    throw httpError(
      400,
      "INVALID_MAILBOX",
      "mailbox must be a valid email or a supported virtual mailbox",
    );
  }

  return normalized;
}

function matchDeliveryPath(
  pathname: string,
  prefix: string,
  suffix = "",
): { deliveryId: string } | null {
  if (!pathname.startsWith(prefix) || !pathname.endsWith(suffix)) {
    return null;
  }

  const raw = pathname.slice(prefix.length, pathname.length - suffix.length).trim();
  if (!raw || raw.includes("/")) {
    return null;
  }

  return {
    deliveryId: raw,
  };
}

function normalizeRequiredEmail(value: string, field: string): string {
  const normalized = normalizeEmail(value);
  if (!normalized) {
    throw new Error(`${field} must be a valid email address`);
  }
  return normalized;
}

function normalizeEmail(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim().toLowerCase();
  if (!EMAIL_RE.test(trimmed)) {
    return null;
  }
  return trimmed;
}

function getEmailDomain(value: string): string | null {
  const atIndex = value.lastIndexOf("@");
  if (atIndex <= 0 || atIndex === value.length - 1) {
    return null;
  }
  return value.slice(atIndex + 1);
}

function normalizeHtml(value: Email["html"]): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const html = value.trim();
  return html.length > 0 ? html : null;
}

function buildReplySubject(subject: string): string {
  if (/^re:/i.test(subject)) {
    return subject;
  }
  return `Re: ${subject}`;
}

function buildAutoReplyText(
  appName: string,
  recipient: string,
  subject: string,
  correlationId: string,
): string {
  return [
    `${appName} 已收到你发给 ${recipient} 的邮件。`,
    `主题: ${subject}`,
    `关联 ID: ${correlationId}`,
    "",
    "这是自动回执。",
  ].join("\n");
}

function threadHeaders(
  originalMessageId: string | null,
  correlationId: string,
): Record<string, string> | undefined {
  const sanitizedMessageId = trimToNull(originalMessageId);

  if (!sanitizedMessageId) {
    return {
      "X-Correlation-Id": correlationId,
    };
  }

  return {
    "In-Reply-To": sanitizedMessageId,
    References: sanitizedMessageId,
    "X-Correlation-Id": correlationId,
  };
}

function shouldSendAutoReply(
  senderEmail: string,
  recipientEmail: string,
  headers: Headers,
): boolean {
  const autoSubmitted = headers.get("auto-submitted");
  if (autoSubmitted && autoSubmitted.toLowerCase() !== "no") {
    return false;
  }

  const sender = senderEmail.trim().toLowerCase();
  if (sender === recipientEmail.trim().toLowerCase()) {
    return false;
  }

  return !sender.startsWith("mailer-daemon@") && !sender.startsWith("postmaster@");
}

function toCorrelationId(messageId: string | null): string {
  const normalized = trimToNull(messageId)
    ?.replace(/^<|>$/g, "")
    .replace(/[^a-zA-Z0-9_.:@-]/g, "_");
  return normalized && normalized.length > 0
    ? `mail_${normalized}`
    : `mail_${crypto.randomUUID()}`;
}

function trimToNull(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toAttachmentBytes(
  value: ParsedAttachment["content"],
): Uint8Array {
  if (value instanceof Uint8Array) {
    return value;
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  if (typeof value === "string") {
    return new TextEncoder().encode(value);
  }
  throw new Error("unsupported attachment content type");
}

function attachmentDownloadPath(id: string): string {
  return `/api/attachments/${id}`;
}

function buildAttachmentStorageKey(
  emailId: string,
  attachmentId: string,
  filename: string,
): string {
  return [
    ATTACHMENT_BUCKET_PREFIX,
    emailId,
    "attachments",
    attachmentId,
    encodeURIComponent(filename),
  ].join("/");
}

function safeAttachmentFilename(attachment: Pick<EmailAttachmentRecord, "filename" | "contentType">): string {
  if (attachment.filename) {
    return attachment.filename;
  }
  const extension = mimeExtension(attachment.contentType);
  return extension ? `attachment.${extension}` : "attachment.bin";
}

function mimeExtension(contentType: string): string | null {
  switch (contentType.toLowerCase()) {
    case "text/plain":
      return "txt";
    case "text/html":
      return "html";
    case "application/pdf":
      return "pdf";
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    default:
      return null;
  }
}

function escapeHeaderFilename(value: string): string {
  return value.replace(/["\\\r\n]/g, "_");
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function isTruthy(value: string | undefined): boolean {
  return value?.toLowerCase() !== "false";
}

function logInfo(event: string, fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ level: "info", event, ...fields }));
}

function logError(event: string, fields: Record<string, unknown>): void {
  console.error(JSON.stringify({ level: "error", event, ...fields }));
}

function httpError(statusCode: number, code: string, message: string): Error {
  const error = new Error(message) as Error & {
    code?: string;
    statusCode?: number;
  };
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function normalizeError(error: unknown): {
  code: string | null;
  message: string;
  statusCode: number;
} {
  if (error instanceof Error) {
    const withCode = error as Error & {
      code?: string;
      statusCode?: number;
    };
    return {
      code: withCode.code ?? null,
      message: error.message,
      statusCode: withCode.statusCode ?? 500,
    };
  }

  return {
    code: null,
    message: "unknown error",
    statusCode: 500,
  };
}

function normalizeProviderMessageId(
  response: SendEmailResult | undefined,
  recordId: string,
): string {
  const providerMessageId = trimToNull(response?.messageId);
  return providerMessageId ?? `local-${recordId}`;
}
