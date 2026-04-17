#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-8787}"
BASE_URL="http://127.0.0.1:${PORT}"
HOME_DIR="${ROOT_DIR}/.home"
TMP_DIR="${ROOT_DIR}/.tmp"
LOG_FILE="${TMP_DIR}/wrangler.verify.log"
RUN_ID="$(python3 - <<'PY'
import uuid
print(uuid.uuid4().hex)
PY
)"

mkdir -p "${HOME_DIR}" "${TMP_DIR}"
export HOME="${HOME_DIR}"

if lsof -iTCP:"${PORT}" -sTCP:LISTEN -n -P >/dev/null 2>&1; then
  echo "port ${PORT} is already in use" >&2
  exit 1
fi

cd "${ROOT_DIR}"
AUTO_REPLY_ENABLED=false bunx wrangler d1 migrations apply brightex-mailbox --local >/dev/null
AUTO_REPLY_ENABLED=false bunx wrangler dev --port "${PORT}" >"${LOG_FILE}" 2>&1 &
SERVER_PID=$!

cleanup() {
  if kill -0 "${SERVER_PID}" >/dev/null 2>&1; then
    kill "${SERVER_PID}" >/dev/null 2>&1 || true
    wait "${SERVER_PID}" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT

for _ in $(seq 1 30); do
  if curl -sf "${BASE_URL}/health" >/dev/null; then
    break
  fi
  sleep 1
done

if ! curl -sf "${BASE_URL}/health" >/dev/null; then
  echo "wrangler dev did not become ready" >&2
  cat "${LOG_FILE}" >&2
  exit 1
fi

INDEX_HTML="$(curl -sf "${BASE_URL}/")"
if [[ "${INDEX_HTML}" != *"极简 Web Mail"* ]]; then
  echo "web ui did not render expected title" >&2
  exit 1
fi

MAILBOXES="$(curl -sf "${BASE_URL}/api/mailboxes")"
node -e '
const payload = JSON.parse(process.argv[1]);
if (!payload.ok) throw new Error("mailboxes returned not ok");
if (!Array.isArray(payload.items)) throw new Error("mailboxes items missing");
const addresses = payload.items.map((item) => item.address).sort();
const expected = ["__unknown__", "inbox@brightex.cc", "jerry@brightex.cc", "tom@brightex.cc"];
if (JSON.stringify(addresses) !== JSON.stringify(expected)) {
  throw new Error(`mailboxes mismatch: ${JSON.stringify(addresses)}`);
}
' "${MAILBOXES}"

INBOUND_FILE="${TMP_DIR}/inbound-test-${RUN_ID}.eml"
UNKNOWN_INBOUND_FILE="${TMP_DIR}/inbound-unknown-test-${RUN_ID}.eml"
ATTACHMENT_INBOUND_FILE="${TMP_DIR}/inbound-attachment-test-${RUN_ID}.eml"
INBOUND_MESSAGE_ID="<local-inbound-test-${RUN_ID}@brightex.cc>"
UNKNOWN_INBOUND_MESSAGE_ID="<local-unknown-test-${RUN_ID}@brightex.cc>"
ATTACHMENT_INBOUND_MESSAGE_ID="<local-inbound-attachment-test-${RUN_ID}@brightex.cc>"

python3 - <<'PY' "${ROOT_DIR}/samples/inbound-test.eml" "${INBOUND_FILE}" "${INBOUND_MESSAGE_ID}"
from pathlib import Path
import sys

source = Path(sys.argv[1]).read_text()
patched = source.replace(
    "Message-ID: <local-inbound-test@brightex.cc>",
    f"Message-ID: {sys.argv[3]}",
)
Path(sys.argv[2]).write_text(patched)
PY

python3 - <<'PY' "${ROOT_DIR}/samples/inbound-test.eml" "${UNKNOWN_INBOUND_FILE}" "${UNKNOWN_INBOUND_MESSAGE_ID}"
from pathlib import Path
import sys

source = Path(sys.argv[1]).read_text()
patched = source.replace(
    "Message-ID: <local-inbound-test@brightex.cc>",
    f"Message-ID: {sys.argv[3]}",
).replace(
    "To: Alpha <alpha@example.com>, Inbox <inbox@brightex.cc>",
    "To: Unknown <abc@brightex.cc>",
)
Path(sys.argv[2]).write_text(patched)
PY

python3 - <<'PY' "${ROOT_DIR}/samples/inbound-attachment-test.eml" "${ATTACHMENT_INBOUND_FILE}" "${ATTACHMENT_INBOUND_MESSAGE_ID}"
from pathlib import Path
import sys

source = Path(sys.argv[1]).read_text()
patched = source.replace(
    "Message-ID: <local-inbound-attachment-test@brightex.cc>",
    f"Message-ID: {sys.argv[3]}",
)
Path(sys.argv[2]).write_text(patched)
PY

curl -sf \
  --request POST "${BASE_URL}/cdn-cgi/handler/email?from=sender@example.com&to=tom@brightex.cc" \
  --header "Content-Type: message/rfc822" \
  --data-binary "@${INBOUND_FILE}" \
  >/dev/null

curl -sf \
  --request POST "${BASE_URL}/cdn-cgi/handler/email?from=sender@example.com&to=jerry@brightex.cc" \
  --header "Content-Type: message/rfc822" \
  --data-binary "@${INBOUND_FILE}" \
  >/dev/null

curl -sf \
  --request POST "${BASE_URL}/cdn-cgi/handler/email?from=sender@example.com&to=abc@brightex.cc" \
  --header "Content-Type: message/rfc822" \
  --data-binary "@${UNKNOWN_INBOUND_FILE}" \
  >/dev/null

curl -sf \
  --request POST "${BASE_URL}/cdn-cgi/handler/email?from=sender@example.com&to=tom@brightex.cc" \
  --header "Content-Type: message/rfc822" \
  --data-binary "@${ATTACHMENT_INBOUND_FILE}" \
  >/dev/null

EMAIL_LIST="$(curl -sf "${BASE_URL}/api/emails?limit=30")"
node -e '
const payload = JSON.parse(process.argv[1]);
if (!payload.ok) throw new Error("email list returned not ok");
if (!Array.isArray(payload.items)) throw new Error("items missing");
if (payload.items.length < 2) throw new Error(`expected at least 2 rows, got ${payload.items.length}`);
const inbound = payload.items.find((item) =>
  item.direction === "inbound"
  && item.status === "received"
  && item.providerMessageId === process.argv[2]
);
if (!inbound) throw new Error("missing inbound record");
if (inbound.recipients.to.length !== 2) throw new Error(`expected 2 inbound to recipients, got ${inbound.recipients.to.length}`);
if (inbound.recipients.cc.length !== 1 || inbound.recipients.cc[0] !== "observer@example.com") throw new Error("inbound cc recipients mismatch");
' "${EMAIL_LIST}" "${INBOUND_MESSAGE_ID}"

SEND_RESPONSE="$(curl -sf \
  --request POST "${BASE_URL}/api/send" \
  --header "Content-Type: application/json" \
  --data '{"to":["jerry@brightex.cc","inbox@brightex.cc"],"cc":"tsuicx@gmail.com","bcc":"tsuicx@qq.com","subject":"manual send","text":"hello from http api"}')"

node -e '
const payload = JSON.parse(process.argv[1]);
if (!payload.ok) throw new Error("send response returned not ok");
if (payload.item.direction !== "outbound") throw new Error("send response is not outbound");
if (payload.item.status !== "sent") throw new Error(`expected sent status, got ${payload.item.status}`);
if (payload.item.recipients.to.length !== 2) throw new Error("outbound to recipients mismatch");
if (payload.item.recipients.cc[0] !== "tsuicx@gmail.com") throw new Error("outbound cc recipients mismatch");
if (payload.item.recipients.bcc[0] !== "tsuicx@qq.com") throw new Error("outbound bcc recipients mismatch");
' "${SEND_RESPONSE}"

BLOCKED_SEND_RESPONSE="$(curl -s \
  --request POST "${BASE_URL}/api/send" \
  --header "Content-Type: application/json" \
  --data '{"to":"blocked@example.com","subject":"blocked send","text":"should fail"}')"

node -e '
const payload = JSON.parse(process.argv[1]);
if (payload.ok) throw new Error("blocked send unexpectedly succeeded");
if (payload.code !== "RECIPIENT_NOT_ALLOWED") throw new Error(`blocked send code mismatch: ${payload.code}`);
' "${BLOCKED_SEND_RESPONSE}"

MAILBOX_TOM="$(curl -sf "${BASE_URL}/api/emails?limit=30&mailbox=tom@brightex.cc")"
node -e '
const payload = JSON.parse(process.argv[1]);
if (!payload.ok) throw new Error("tom mailbox returned not ok");
if (!Array.isArray(payload.items)) throw new Error("tom mailbox items missing");
const inbound = payload.items.find((item) => item.direction === "inbound" && item.mailboxAddress === "tom@brightex.cc" && item.providerMessageId === process.argv[2]);
if (!inbound) throw new Error("tom inbox missing inbound mail");
if (inbound.folder !== "inbox") throw new Error(`tom inbox folder mismatch: ${inbound.folder}`);
if (inbound.deliveryRole !== "bcc") throw new Error(`tom inbox role mismatch: ${inbound.deliveryRole}`);
if (inbound.isRead !== false) throw new Error(`tom inbound initial read state mismatch: ${inbound.isRead}`);
if (!inbound.deliveryId) throw new Error("tom inbound delivery id missing");
const attachmentMail = payload.items.find((item) => item.providerMessageId === process.argv[3]);
if (!attachmentMail) throw new Error("tom attachment mail missing");
if (!Array.isArray(attachmentMail.attachments) || attachmentMail.attachments.length !== 1) {
  throw new Error("tom attachment mail metadata mismatch");
}
if (attachmentMail.attachments[0].filename !== "notes.txt") {
  throw new Error(`attachment filename mismatch: ${attachmentMail.attachments[0].filename}`);
}
' "${MAILBOX_TOM}" "${INBOUND_MESSAGE_ID}" "${ATTACHMENT_INBOUND_MESSAGE_ID}"

TOM_INBOUND_DELIVERY_ID="$(node -e '
const payload = JSON.parse(process.argv[1]);
const inbound = payload.items.find((item) => item.direction === "inbound" && item.mailboxAddress === "tom@brightex.cc" && item.providerMessageId === process.argv[2]);
process.stdout.write(String(inbound.deliveryId));
' "${MAILBOX_TOM}" "${INBOUND_MESSAGE_ID}")"

curl -sf \
  --request POST "${BASE_URL}/api/deliveries/${TOM_INBOUND_DELIVERY_ID}/read" \
  --header "Content-Type: application/json" \
  --data '{"read":true}' \
  >/dev/null

MAILBOX_TOM_READ="$(curl -sf "${BASE_URL}/api/emails?limit=30&mailbox=tom@brightex.cc")"
node -e '
const payload = JSON.parse(process.argv[1]);
const inbound = payload.items.find((item) => item.deliveryId === process.argv[2]);
if (!inbound) throw new Error("tom inbound missing after mark read");
if (inbound.isRead !== true) throw new Error(`tom inbound read=true mismatch: ${inbound.isRead}`);
' "${MAILBOX_TOM_READ}" "${TOM_INBOUND_DELIVERY_ID}"

curl -sf \
  --request POST "${BASE_URL}/api/deliveries/${TOM_INBOUND_DELIVERY_ID}/read" \
  --header "Content-Type: application/json" \
  --data '{"read":false}' \
  >/dev/null

MAILBOX_TOM_UNREAD="$(curl -sf "${BASE_URL}/api/emails?limit=30&mailbox=tom@brightex.cc")"
node -e '
const payload = JSON.parse(process.argv[1]);
const inbound = payload.items.find((item) => item.deliveryId === process.argv[2]);
if (!inbound) throw new Error("tom inbound missing after mark unread");
if (inbound.isRead !== false) throw new Error(`tom inbound read=false mismatch: ${inbound.isRead}`);
' "${MAILBOX_TOM_UNREAD}" "${TOM_INBOUND_DELIVERY_ID}"

TOM_ATTACHMENT_PATH="$(node -e '
const payload = JSON.parse(process.argv[1]);
const attachmentMail = payload.items.find((item) => item.providerMessageId === process.argv[2]);
process.stdout.write(String(attachmentMail.attachments[0].downloadPath));
' "${MAILBOX_TOM}" "${ATTACHMENT_INBOUND_MESSAGE_ID}")"

ATTACHMENT_CONTENT="$(curl -sf "${BASE_URL}${TOM_ATTACHMENT_PATH}")"
if [[ "${ATTACHMENT_CONTENT}" != "hello from attachment" ]]; then
  echo "attachment download content mismatch: ${ATTACHMENT_CONTENT}" >&2
  exit 1
fi

OUTBOUND_ATTACHMENT_FILE="${TMP_DIR}/outbound-attachment.txt"
printf 'outbound attachment body\n' > "${OUTBOUND_ATTACHMENT_FILE}"

SEND_TOM_RESPONSE="$(curl -sf \
  --request POST "${BASE_URL}/api/send" \
  --header "Accept: application/json" \
  --form "from=tom@brightex.cc" \
  --form "to=tsuicx@gmail.com" \
  --form "subject=tom sent mail" \
  --form "text=hello from tom" \
  --form "attachments=@${OUTBOUND_ATTACHMENT_FILE};type=text/plain")"

node -e '
const payload = JSON.parse(process.argv[1]);
if (!payload.ok) throw new Error("tom send response returned not ok");
if (payload.item.fromEmail !== "tom@brightex.cc") throw new Error(`tom send from mismatch: ${payload.item.fromEmail}`);
if (payload.item.status !== "sent") throw new Error(`tom send status mismatch: ${payload.item.status}`);
if (!Array.isArray(payload.item.attachments) || payload.item.attachments.length !== 1) {
  throw new Error("tom send attachment metadata missing");
}
' "${SEND_TOM_RESPONSE}"

MAILBOX_TOM_AFTER_SEND="$(curl -sf "${BASE_URL}/api/emails?limit=30&mailbox=tom@brightex.cc")"
node -e '
const payload = JSON.parse(process.argv[1]);
if (!payload.ok) throw new Error("tom mailbox after send returned not ok");
if (!Array.isArray(payload.items)) throw new Error("tom mailbox after send items missing");
const sent = payload.items.find((item) => item.direction === "outbound" && item.folder === "sent" && item.fromEmail === "tom@brightex.cc");
if (!sent) throw new Error("tom sent folder missing outbound mail");
if (sent.isRead !== true) throw new Error(`tom sent read state mismatch: ${sent.isRead}`);
if (!Array.isArray(sent.attachments) || sent.attachments.length !== 1) {
  throw new Error("tom sent attachment metadata missing");
}
' "${MAILBOX_TOM_AFTER_SEND}"

curl -sf \
  --request DELETE "${BASE_URL}/api/deliveries/${TOM_INBOUND_DELIVERY_ID}" \
  --header "Accept: application/json" \
  >/dev/null

MAILBOX_TOM_AFTER_DELETE="$(curl -sf "${BASE_URL}/api/emails?limit=30&mailbox=tom@brightex.cc")"
node -e '
const payload = JSON.parse(process.argv[1]);
const deleted = payload.items.find((item) => item.deliveryId === process.argv[2]);
if (deleted) throw new Error("deleted tom inbound mail still visible");
' "${MAILBOX_TOM_AFTER_DELETE}" "${TOM_INBOUND_DELIVERY_ID}"

UNKNOWN_MAILBOX="$(curl -sf "${BASE_URL}/api/emails?limit=30&mailbox=__unknown__")"
node -e '
const payload = JSON.parse(process.argv[1]);
if (!payload.ok) throw new Error("unknown mailbox returned not ok");
if (!Array.isArray(payload.items)) throw new Error("unknown mailbox items missing");
const inbound = payload.items.find((item) => item.direction === "inbound" && item.mailboxAddress === "abc@brightex.cc");
if (!inbound) throw new Error("unknown mailbox missing catch-all inbound mail");
if (inbound.folder !== "inbox") throw new Error(`unknown mailbox folder mismatch: ${inbound.folder}`);
' "${UNKNOWN_MAILBOX}"

echo "local verify passed"
