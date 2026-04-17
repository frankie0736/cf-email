interface AppUiConfig {
  appName: string;
  autoReplyEnabled: boolean;
  mailFrom: string;
}

export function renderAppHtml(config: AppUiConfig): string {
  const boot = escapeForInlineScript(JSON.stringify(config));

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1, viewport-fit=cover"
    />
    <title>${escapeHtml(config.appName)}</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f4efe7;
        --bg-strong: #efe6d8;
        --panel: rgba(255, 252, 247, 0.92);
        --panel-strong: #fffdf9;
        --text: #19212c;
        --muted: #667487;
        --line: rgba(25, 33, 44, 0.08);
        --line-strong: rgba(25, 33, 44, 0.16);
        --accent: #0f6c74;
        --accent-strong: #084c52;
        --accent-soft: rgba(15, 108, 116, 0.12);
        --warn: #aa4d1f;
        --warn-soft: rgba(170, 77, 31, 0.12);
        --shadow: 0 20px 50px rgba(41, 55, 71, 0.08);
        --radius-xl: 28px;
        --radius-lg: 22px;
        --radius-md: 16px;
        --radius-sm: 12px;
        --font-sans: "Avenir Next", "Segoe UI Variable", "Helvetica Neue", sans-serif;
        --font-mono: "SFMono-Regular", "Menlo", "Monaco", monospace;
      }

      * {
        box-sizing: border-box;
      }

      html,
      body {
        margin: 0;
        min-height: 100%;
        background:
          radial-gradient(circle at top left, rgba(255, 255, 255, 0.86), transparent 36%),
          linear-gradient(180deg, #f8f3ea 0%, var(--bg) 48%, #ece1d0 100%);
        color: var(--text);
        font-family: var(--font-sans);
      }

      body {
        padding: 24px;
      }

      button,
      input,
      textarea {
        font: inherit;
      }

      button {
        cursor: pointer;
      }

      .shell {
        width: min(1480px, 100%);
        margin: 0 auto;
        display: grid;
        gap: 18px;
      }

      .hero {
        position: relative;
        overflow: hidden;
        padding: 28px 30px;
        border: 1px solid rgba(255, 255, 255, 0.7);
        border-radius: var(--radius-xl);
        background:
          linear-gradient(140deg, rgba(255, 250, 243, 0.92), rgba(248, 244, 236, 0.78)),
          linear-gradient(90deg, rgba(15, 108, 116, 0.08), rgba(231, 128, 68, 0.08));
        box-shadow: var(--shadow);
      }

      .hero::after {
        content: "";
        position: absolute;
        inset: auto -40px -70px auto;
        width: 220px;
        height: 220px;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(231, 128, 68, 0.18), transparent 72%);
        pointer-events: none;
      }

      .hero-top {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
      }

      .hero-copy {
        display: grid;
        gap: 10px;
      }

      .eyebrow {
        color: var(--accent);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }

      h1 {
        margin: 0;
        font-size: clamp(28px, 3vw, 46px);
        line-height: 1.02;
        letter-spacing: -0.04em;
      }

      .hero-subtitle {
        max-width: 720px;
        color: var(--muted);
        font-size: 15px;
        line-height: 1.6;
      }

      .hero-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 4px;
      }

      .hero-controls {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin-top: 18px;
      }

      .pill {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 10px 14px;
        border: 1px solid var(--line);
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.6);
        color: var(--muted);
        font-size: 13px;
        font-weight: 600;
      }

      .selector {
        display: grid;
        gap: 8px;
        min-width: min(360px, 100%);
      }

      .selector span {
        color: var(--muted);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .selector select {
        width: 100%;
        min-height: 46px;
        padding: 0 16px;
        border: 1px solid var(--line);
        border-radius: 16px;
        background: rgba(255, 255, 255, 0.88);
        color: var(--text);
        outline: none;
      }

      .selector select:focus {
        border-color: rgba(15, 108, 116, 0.42);
        box-shadow: 0 0 0 4px rgba(15, 108, 116, 0.08);
      }

      .pill strong {
        color: var(--text);
        font-weight: 700;
      }

      .layout {
        display: grid;
        grid-template-columns: 360px minmax(320px, 420px) minmax(0, 1fr);
        gap: 18px;
        min-height: 72vh;
      }

      .card {
        min-width: 0;
        border: 1px solid rgba(255, 255, 255, 0.72);
        border-radius: var(--radius-xl);
        background: var(--panel);
        box-shadow: var(--shadow);
        backdrop-filter: blur(16px);
      }

      .composer {
        display: grid;
        align-content: start;
        gap: 18px;
        padding: 22px;
        background:
          linear-gradient(180deg, rgba(255, 248, 239, 0.94), rgba(255, 253, 249, 0.92)),
          var(--panel);
      }

      .section-head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 12px;
      }

      .section-head h2,
      .section-head h3 {
        margin: 0;
        font-size: 18px;
        letter-spacing: -0.03em;
      }

      .section-head span {
        color: var(--muted);
        font-size: 13px;
      }

      .field-grid {
        display: grid;
        gap: 12px;
      }

      .field {
        display: grid;
        gap: 8px;
      }

      .field label {
        color: var(--muted);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .field-note {
        color: var(--muted);
        font-size: 12px;
        line-height: 1.5;
      }

      .field input,
      .field textarea {
        width: 100%;
        padding: 14px 16px;
        border: 1px solid var(--line);
        border-radius: var(--radius-md);
        background: rgba(255, 255, 255, 0.88);
        color: var(--text);
        outline: none;
        transition:
          border-color 120ms ease,
          box-shadow 120ms ease,
          transform 120ms ease;
      }

      .field input:focus,
      .field textarea:focus {
        border-color: rgba(15, 108, 116, 0.42);
        box-shadow: 0 0 0 4px rgba(15, 108, 116, 0.08);
        transform: translateY(-1px);
      }

      .field textarea {
        min-height: 220px;
        resize: vertical;
      }

      .composer-actions {
        display: flex;
        gap: 10px;
      }

      .button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        min-height: 46px;
        padding: 0 18px;
        border: 1px solid transparent;
        border-radius: 999px;
        background: var(--panel-strong);
        color: var(--text);
        font-weight: 700;
      }

      .button-primary {
        background: linear-gradient(180deg, #0f6c74 0%, #09545a 100%);
        color: white;
        box-shadow: 0 12px 30px rgba(15, 108, 116, 0.18);
      }

      .button-secondary {
        border-color: var(--line);
        color: var(--muted);
        background: rgba(255, 255, 255, 0.72);
      }

      .button-danger {
        border-color: rgba(170, 77, 31, 0.18);
        background: rgba(170, 77, 31, 0.1);
        color: var(--warn);
      }

      .button:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }

      .composer-status {
        min-height: 22px;
        color: var(--muted);
        font-size: 13px;
      }

      .composer-status.is-error {
        color: var(--warn);
      }

      .inbox {
        display: grid;
        grid-template-rows: auto auto minmax(0, 1fr);
        overflow: hidden;
      }

      .inbox-toolbar,
      .detail-toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 22px 22px 14px;
      }

      .toolbar-group {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .segmented {
        display: inline-flex;
        gap: 6px;
        padding: 6px;
        border: 1px solid var(--line);
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.74);
      }

      .segment {
        min-height: 36px;
        padding: 0 14px;
        border: none;
        border-radius: 999px;
        background: transparent;
        color: var(--muted);
        font-size: 13px;
        font-weight: 700;
      }

      .segment.active {
        background: var(--accent-soft);
        color: var(--accent-strong);
      }

      .summary-strip {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
        padding: 0 22px 16px;
      }

      .summary {
        padding: 14px 16px;
        border: 1px solid var(--line);
        border-radius: var(--radius-md);
        background: rgba(255, 255, 255, 0.72);
      }

      .summary span {
        display: block;
        color: var(--muted);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .summary strong {
        display: block;
        margin-top: 8px;
        font-size: 22px;
        letter-spacing: -0.04em;
      }

      .message-list {
        margin: 0;
        padding: 0 12px 16px;
        list-style: none;
        overflow: auto;
      }

      .message-item {
        margin: 0;
      }

      .message-button {
        width: 100%;
        display: grid;
        gap: 8px;
        padding: 16px;
        border: 1px solid transparent;
        border-radius: 18px;
        background: transparent;
        text-align: left;
        transition:
          background 120ms ease,
          transform 120ms ease,
          border-color 120ms ease;
      }

      .message-button:hover {
        background: rgba(255, 255, 255, 0.74);
        transform: translateY(-1px);
      }

      .message-button.active {
        border-color: rgba(15, 108, 116, 0.18);
        background:
          linear-gradient(180deg, rgba(15, 108, 116, 0.08), rgba(15, 108, 116, 0.04)),
          rgba(255, 255, 255, 0.9);
      }

      .message-button.is-unread {
        background: rgba(15, 108, 116, 0.05);
      }

      .message-button.is-unread .message-subject,
      .message-button.is-unread .message-address {
        font-weight: 800;
      }

      .message-meta {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        color: var(--muted);
        font-size: 12px;
      }

      .message-address {
        min-width: 0;
        font-weight: 700;
        color: var(--text);
      }

      .message-subject {
        font-size: 16px;
        font-weight: 700;
        letter-spacing: -0.02em;
      }

      .message-preview {
        color: var(--muted);
        font-size: 13px;
        line-height: 1.5;
      }

      .chip-row {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 10px;
        border-radius: 999px;
        background: rgba(25, 33, 44, 0.05);
        color: var(--muted);
        font-size: 12px;
        font-weight: 700;
      }

      .chip.direction-inbound,
      .chip.status-received {
        background: rgba(15, 108, 116, 0.12);
        color: var(--accent-strong);
      }

      .chip.direction-outbound,
      .chip.status-sent {
        background: rgba(231, 128, 68, 0.14);
        color: #9a4f1f;
      }

      .chip.status-failed {
        background: var(--warn-soft);
        color: var(--warn);
      }

      .chip.read-unread {
        background: rgba(15, 108, 116, 0.12);
        color: var(--accent-strong);
      }

      .detail {
        display: grid;
        grid-template-rows: auto minmax(0, 1fr);
        overflow: hidden;
      }

      .detail-content {
        overflow: auto;
        padding: 0 22px 22px;
      }

      .detail-empty,
      .empty-state {
        display: grid;
        place-items: center;
        min-height: 260px;
        padding: 32px;
        color: var(--muted);
        text-align: center;
      }

      .detail-card {
        display: grid;
        gap: 18px;
      }

      .detail-header {
        display: grid;
        gap: 12px;
        padding-bottom: 18px;
        border-bottom: 1px solid var(--line);
      }

      .detail-header h2 {
        margin: 0;
        font-size: clamp(24px, 2.5vw, 34px);
        letter-spacing: -0.04em;
      }

      .detail-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 14px;
      }

      .meta-block {
        padding: 14px 16px;
        border: 1px solid var(--line);
        border-radius: var(--radius-md);
        background: rgba(255, 255, 255, 0.72);
      }

      .meta-block dt {
        margin: 0;
        color: var(--muted);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .meta-block dd {
        margin: 8px 0 0;
        font-size: 14px;
        line-height: 1.6;
        word-break: break-word;
      }

      .message-body {
        display: grid;
        gap: 16px;
      }

      .body-panel {
        padding: 18px;
        border: 1px solid var(--line);
        border-radius: var(--radius-lg);
        background: rgba(255, 255, 255, 0.72);
      }

      .body-panel h3 {
        margin: 0 0 12px;
        font-size: 13px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--muted);
      }

      .body-text {
        margin: 0;
        white-space: pre-wrap;
        word-break: break-word;
        line-height: 1.7;
      }

      .attachment-list {
        display: grid;
        gap: 10px;
      }

      .attachment-link {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 12px 14px;
        border: 1px solid var(--line);
        border-radius: 14px;
        background: rgba(255, 255, 255, 0.78);
        color: var(--text);
        text-decoration: none;
      }

      .attachment-link small {
        color: var(--muted);
      }

      .body-frame {
        width: 100%;
        min-height: 320px;
        border: 1px solid var(--line);
        border-radius: 14px;
        background: white;
      }

      .small {
        color: var(--muted);
        font-size: 12px;
      }

      .mono {
        font-family: var(--font-mono);
      }

      .hidden {
        display: none !important;
      }

      @media (max-width: 1220px) {
        .layout {
          grid-template-columns: 320px minmax(280px, 360px) minmax(0, 1fr);
        }

        .summary-strip {
          grid-template-columns: 1fr;
        }
      }

      @media (max-width: 980px) {
        body {
          padding: 14px;
        }

        .layout {
          grid-template-columns: 1fr;
        }

        .detail,
        .inbox,
        .composer {
          min-height: auto;
        }

        .detail-grid {
          grid-template-columns: 1fr;
        }

        .hero {
          padding: 22px;
        }

        .hero-top {
          flex-direction: column;
        }
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <section class="hero card">
        <div class="hero-top">
          <div class="hero-copy">
            <div class="eyebrow">Brightex Mailbox</div>
            <h1>极简 Web Mail</h1>
            <div class="hero-subtitle">
              无登录，直接用。左侧写信，中间看收件列表，右侧看正文。数据全部走 Cloudflare Worker + D1。
            </div>
            <div class="hero-controls">
              <label class="selector" for="mailboxSelect">
                <span>当前邮箱</span>
                <select id="mailboxSelect" aria-label="切换邮箱账号"></select>
              </label>
            </div>
            <div class="hero-actions">
              <div class="pill"><strong>默认发件人</strong><span id="mailFromPill">${escapeHtml(config.mailFrom)}</span></div>
              <div class="pill"><strong>自动回执</strong><span id="autoReplyPill">${config.autoReplyEnabled ? "开启" : "关闭"}</span></div>
              <div class="pill"><strong>模式</strong><span>公开多邮箱面板</span></div>
            </div>
          </div>
        </div>
      </section>

      <section class="layout">
        <aside class="card composer">
          <div class="section-head">
            <h2>写邮件</h2>
            <span id="composeHint">多地址用逗号、分号或换行分隔</span>
          </div>
          <form id="composeForm" class="field-grid">
            <div class="field">
              <label for="fromInput">From</label>
              <input id="fromInput" name="from" type="email" autocomplete="off" />
            </div>
            <div class="field">
              <label for="toInput">To</label>
              <input id="toInput" name="to" type="text" autocomplete="off" required />
              <div class="field-note">支持多人主送</div>
            </div>
            <div class="field">
              <label for="ccInput">Cc</label>
              <input id="ccInput" name="cc" type="text" autocomplete="off" />
            </div>
            <div class="field">
              <label for="bccInput">Bcc</label>
              <input id="bccInput" name="bcc" type="text" autocomplete="off" />
            </div>
            <div class="field">
              <label for="subjectInput">Subject</label>
              <input id="subjectInput" name="subject" type="text" autocomplete="off" />
            </div>
            <div class="field">
              <label for="bodyInput">Body</label>
              <textarea id="bodyInput" name="text" required></textarea>
            </div>
            <div class="field">
              <label for="attachmentsInput">Attachments</label>
              <input id="attachmentsInput" name="attachments" type="file" multiple />
              <div class="field-note">附件下载会通过当前 Worker 中转；回复时不会自动继承原邮件附件。</div>
            </div>
            <div class="composer-actions">
              <button id="sendButton" class="button button-primary" type="submit">发送</button>
              <button id="resetButton" class="button button-secondary" type="button">清空</button>
            </div>
            <div id="composeStatus" class="composer-status" aria-live="polite"></div>
          </form>
        </aside>

        <section class="card inbox">
          <div class="inbox-toolbar">
            <div class="section-head">
              <h2>邮件列表</h2>
            </div>
            <div class="toolbar-group">
              <div class="segmented" role="tablist" aria-label="邮件过滤器">
                <button class="segment active" type="button" data-filter="all">全部</button>
                <button class="segment" type="button" data-filter="inbound">收件</button>
                <button class="segment" type="button" data-filter="outbound">发件</button>
              </div>
              <button id="refreshButton" class="button button-secondary" type="button">刷新</button>
            </div>
          </div>
          <div class="summary-strip">
            <div class="summary">
              <span>总计</span>
              <strong id="totalCount">0</strong>
            </div>
            <div class="summary">
              <span>收件</span>
              <strong id="inboundCount">0</strong>
            </div>
            <div class="summary">
              <span>发件</span>
              <strong id="outboundCount">0</strong>
            </div>
          </div>
          <ul id="messageList" class="message-list"></ul>
        </section>

        <section class="card detail">
          <div class="detail-toolbar">
            <div class="section-head">
              <h2>正文</h2>
              <span id="detailCaption">点击中间列表查看详情</span>
            </div>
            <div class="toolbar-group">
              <button id="readToggleButton" class="button button-secondary hidden" type="button">标记已读</button>
              <button id="replyButton" class="button button-secondary hidden" type="button">回复到编辑器</button>
              <button id="deleteButton" class="button button-danger hidden" type="button">删除</button>
            </div>
          </div>
          <div id="detailContent" class="detail-content">
            <div class="detail-empty">
              <div>
                <div class="eyebrow">Mailbox</div>
                <p>这里会显示当前选中邮件的元数据、正文和 HTML 预览。</p>
              </div>
            </div>
          </div>
        </section>
      </section>
    </main>

    <script>
      (() => {
        const config = JSON.parse("${boot}");
        const state = {
          autoReadSuppressedKey: null,
          filter: "all",
          items: [],
          mailboxes: [],
          currentMailbox: null,
          readTimer: null,
          selectedId: null,
          loading: false,
        };

        const elements = {
          autoReplyPill: document.getElementById("autoReplyPill"),
          attachmentsInput: document.getElementById("attachmentsInput"),
          bccInput: document.getElementById("bccInput"),
          bodyInput: document.getElementById("bodyInput"),
          ccInput: document.getElementById("ccInput"),
          composeForm: document.getElementById("composeForm"),
          composeHint: document.getElementById("composeHint"),
          composeStatus: document.getElementById("composeStatus"),
          deleteButton: document.getElementById("deleteButton"),
          detailCaption: document.getElementById("detailCaption"),
          detailContent: document.getElementById("detailContent"),
          fromInput: document.getElementById("fromInput"),
          inboundCount: document.getElementById("inboundCount"),
          mailFromPill: document.getElementById("mailFromPill"),
          mailboxSelect: document.getElementById("mailboxSelect"),
          messageList: document.getElementById("messageList"),
          outboundCount: document.getElementById("outboundCount"),
          readToggleButton: document.getElementById("readToggleButton"),
          refreshButton: document.getElementById("refreshButton"),
          replyButton: document.getElementById("replyButton"),
          resetButton: document.getElementById("resetButton"),
          segmentButtons: Array.from(document.querySelectorAll(".segment")),
          sendButton: document.getElementById("sendButton"),
          subjectInput: document.getElementById("subjectInput"),
          toInput: document.getElementById("toInput"),
          totalCount: document.getElementById("totalCount"),
        };

        elements.autoReplyPill.textContent = config.autoReplyEnabled ? "开启" : "关闭";

        elements.composeForm.addEventListener("submit", onSend);
        elements.mailboxSelect.addEventListener("change", onMailboxChange);
        elements.deleteButton.addEventListener("click", onDeleteSelected);
        elements.readToggleButton.addEventListener("click", onToggleRead);
        elements.refreshButton.addEventListener("click", () => loadEmails(true));
        elements.resetButton.addEventListener("click", resetCompose);
        elements.replyButton.addEventListener("click", onReply);

        for (const button of elements.segmentButtons) {
          button.addEventListener("click", () => {
            state.filter = button.dataset.filter || "all";
            clearReadTimer();
            syncFilterButtons();
            renderList();
            renderDetail();
          });
        }

        boot();
        setInterval(() => loadEmails(false), 15000);

        async function boot() {
          syncFilterButtons();

          try {
            await loadMailboxes();
            await loadEmails(false);
          } catch (error) {
            const message = error instanceof Error ? error.message : "unknown error";
            setComposeStatus("初始化失败: " + message, true);
          }
        }

        async function loadMailboxes() {
          const response = await fetch("/api/mailboxes", {
            headers: { "accept": "application/json" },
          });
          const payload = await response.json();
          if (!response.ok || !payload.ok) {
            throw new Error(payload.error || "failed to load mailboxes");
          }

          state.mailboxes = Array.isArray(payload.items) ? payload.items : [];
          state.currentMailbox = pickInitialMailbox();
          renderMailboxOptions();
          syncCurrentMailbox();
        }

        async function loadEmails(showStatus) {
          if (state.loading) return;
          state.loading = true;
          if (showStatus) setComposeStatus("正在刷新邮件列表...", false);

          try {
            const url = new URL("/api/emails", window.location.origin);
            url.searchParams.set("limit", "100");
            if (state.currentMailbox) {
              url.searchParams.set("mailbox", state.currentMailbox);
            }

            const response = await fetch(url, {
              headers: { "accept": "application/json" },
            });
            const payload = await response.json();
            if (!response.ok || !payload.ok) {
              throw new Error(payload.error || "failed to load emails");
            }

            state.items = Array.isArray(payload.items) ? payload.items : [];
            if (!state.selectedId && state.items.length > 0) {
              state.selectedId = getItemKey(state.items[0]);
            }

            const selectedExists = state.items.some((item) => matchesSelectedItem(item, state.selectedId));
            if (!selectedExists) {
              state.selectedId = state.items[0] ? getItemKey(state.items[0]) : null;
            }

            renderCounts();
            renderList();
            renderDetail();

            if (showStatus) setComposeStatus("已刷新。", false);
          } catch (error) {
            const message = error instanceof Error ? error.message : "unknown error";
            if (showStatus) setComposeStatus("刷新失败: " + message, true);
          } finally {
            state.loading = false;
          }
        }

        async function onSend(event) {
          event.preventDefault();
          const form = new FormData(elements.composeForm);

          elements.sendButton.disabled = true;
          setComposeStatus("正在发送...", false);

          try {
            const response = await fetch("/api/send", {
              method: "POST",
              headers: {
                "accept": "application/json",
              },
              body: form,
            });

            const result = await response.json();
            if (!response.ok || !result.ok) {
              throw new Error(result.error || "send failed");
            }

            resetCompose(false);
            state.selectedId = result.item.id;
            setComposeStatus("发送成功。", false);
            await loadEmails(false);
          } catch (error) {
            const message = error instanceof Error ? error.message : "unknown error";
            setComposeStatus("发送失败: " + message, true);
          } finally {
            elements.sendButton.disabled = false;
          }
        }

        function renderCounts() {
          const inbound = state.items.filter((item) => item.direction === "inbound").length;
          const outbound = state.items.filter((item) => item.direction === "outbound").length;
          elements.totalCount.textContent = String(state.items.length);
          elements.inboundCount.textContent = String(inbound);
          elements.outboundCount.textContent = String(outbound);
        }

        function getVisibleItems() {
          if (state.filter === "all") return state.items;
          return state.items.filter((item) => item.direction === state.filter);
        }

        function renderList() {
          const visibleItems = getVisibleItems();

          if (visibleItems.length === 0) {
            elements.messageList.innerHTML = \`
              <li class="empty-state">
                <div>
                  <div class="eyebrow">Empty</div>
                  <p>当前过滤器下还没有邮件。</p>
                </div>
              </li>
            \`;
            return;
          }

          elements.messageList.innerHTML = visibleItems
            .map((item) => {
              const counterpart = item.direction === "inbound"
                ? item.fromEmail
                : pickPrimaryRecipient(item);
              const preview = item.textBody || item.htmlBody || "无正文";
              const active = matchesSelectedItem(item, state.selectedId) ? " active" : "";
              const unread = item.isRead === false ? " is-unread" : "";
              const attachments = normalizeAttachments(item.attachments);
              return \`
                <li class="message-item">
                  <button class="message-button\${active}\${unread}" type="button" data-key="\${escapeAttr(getItemKey(item))}">
                    <div class="message-meta">
                      <span class="message-address">\${escapeHtml(counterpart)}</span>
                      <span>\${escapeHtml(formatTime(item.createdAt))}</span>
                    </div>
                    <div class="message-subject">\${escapeHtml(item.subject)}</div>
                    <div class="message-preview">\${escapeHtml(trimPreview(preview))}</div>
                    <div class="chip-row">
                      \${item.isRead === false ? "<span class='chip read-unread'>未读</span>" : ""}
                      \${attachments.length > 0 ? "<span class='chip'>📎附件 " + attachments.length + "</span>" : ""}
                      \${item.mailboxAddress ? "<span class='chip'>" + escapeHtml(item.mailboxAddress) + "</span>" : ""}
                      \${item.folder ? "<span class='chip'>" + escapeHtml(item.folder) + "</span>" : ""}
                      <span class="chip direction-\${escapeAttr(item.direction)}">\${escapeHtml(item.direction)}</span>
                      <span class="chip status-\${escapeAttr(item.status)}">\${escapeHtml(item.status)}</span>
                      <span class="chip">\${escapeHtml(item.source)}</span>
                    </div>
                  </button>
                </li>
              \`;
            })
            .join("");

          for (const button of elements.messageList.querySelectorAll(".message-button")) {
            button.addEventListener("click", () => {
              state.selectedId = button.dataset.key || null;
              state.autoReadSuppressedKey = null;
              renderList();
              renderDetail();
            });
          }
        }

        function renderDetail() {
          const visibleItems = getVisibleItems();
          const fallback = visibleItems[0] || null;
          const item = visibleItems.find((entry) => matchesSelectedItem(entry, state.selectedId)) || fallback;

          if (!item) {
            clearReadTimer();
            elements.deleteButton.classList.add("hidden");
            elements.readToggleButton.classList.add("hidden");
            elements.replyButton.classList.add("hidden");
            elements.detailCaption.textContent = "当前过滤器下没有可展示的邮件";
            elements.detailContent.innerHTML = \`
              <div class="detail-empty">
                <div>
                  <div class="eyebrow">Empty</div>
                  <p>先发一封或者收一封邮件。</p>
                </div>
              </div>
            \`;
            return;
          }

          state.selectedId = getItemKey(item);
          if (state.autoReadSuppressedKey && state.autoReadSuppressedKey !== state.selectedId) {
            state.autoReadSuppressedKey = null;
          }
          const mailboxCaption = item.mailboxAddress || state.currentMailbox || "当前邮箱";
          elements.detailCaption.textContent = mailboxCaption + (item.direction === "inbound" ? " / 收件详情" : " / 发件详情");
          elements.deleteButton.classList.toggle("hidden", !item.deliveryId);
          elements.readToggleButton.classList.toggle("hidden", !item.deliveryId);
          elements.readToggleButton.textContent = item.isRead === false ? "标记已读" : "标记未读";
          elements.replyButton.classList.toggle("hidden", item.direction !== "inbound");
          elements.replyButton.dataset.replyId = item.id;
          elements.readToggleButton.dataset.deliveryId = item.deliveryId || "";
          elements.deleteButton.dataset.deliveryId = item.deliveryId || "";

          const attachments = normalizeAttachments(item.attachments);
          const recipients = normalizeRecipients(item.recipients);
          const textPanel = item.textBody
            ? \`
                <section class="body-panel">
                  <h3>Text</h3>
                  <pre class="body-text">\${escapeHtml(item.textBody)}</pre>
                </section>
              \`
            : "";
          const htmlPanel = item.htmlBody
            ? \`
                <section class="body-panel">
                  <h3>HTML 预览</h3>
                  <iframe
                    class="body-frame"
                    sandbox=""
                    referrerpolicy="no-referrer"
                    srcdoc="\${escapeAttr(item.htmlBody)}"
                  ></iframe>
                </section>
              \`
            : "";
          const attachmentPanel = attachments.length > 0
            ? \`
                <section class="body-panel">
                  <h3>附件</h3>
                  <div class="attachment-list">
                    \${attachments
                      .map((attachment) => {
                        return "<a class='attachment-link' href='" + escapeAttr(attachment.downloadPath) + "' download>"
                          + "<span>📎 " + escapeHtml(attachment.filename || "attachment") + "</span>"
                          + "<small>" + escapeHtml(formatAttachmentMeta(attachment)) + "</small>"
                          + "</a>";
                      })
                      .join("")}
                  </div>
                </section>
              \`
            : "";

          elements.detailContent.innerHTML = \`
            <article class="detail-card">
              <header class="detail-header">
                <div class="chip-row">
                  \${item.isRead === false ? "<span class='chip read-unread'>未读</span>" : "<span class='chip'>已读</span>"}
                  \${attachments.length > 0 ? "<span class='chip'>📎附件 " + attachments.length + "</span>" : ""}
                  \${item.mailboxAddress ? "<span class='chip'>" + escapeHtml(item.mailboxAddress) + "</span>" : ""}
                  \${item.folder ? "<span class='chip'>" + escapeHtml(item.folder) + "</span>" : ""}
                  <span class="chip direction-\${escapeAttr(item.direction)}">\${escapeHtml(item.direction)}</span>
                  <span class="chip status-\${escapeAttr(item.status)}">\${escapeHtml(item.status)}</span>
                  <span class="chip">\${escapeHtml(item.source)}</span>
                </div>
                <h2>\${escapeHtml(item.subject)}</h2>
                <div class="small mono">correlation: \${escapeHtml(item.correlationId)}</div>
              </header>

              <div class="detail-grid">
                <dl class="meta-block">
                  <dt>Mailbox</dt>
                  <dd>\${escapeHtml(item.mailboxAddress || state.currentMailbox || "n/a")}</dd>
                </dl>
                <dl class="meta-block">
                  <dt>Folder</dt>
                  <dd>\${escapeHtml(item.folder || "n/a")}</dd>
                </dl>
                <dl class="meta-block">
                  <dt>From</dt>
                  <dd>\${escapeHtml(item.fromEmail)}</dd>
                </dl>
                <dl class="meta-block">
                  <dt>To</dt>
                  <dd>\${escapeHtml(formatRecipients(recipients.to))}</dd>
                </dl>
                <dl class="meta-block">
                  <dt>Cc</dt>
                  <dd>\${escapeHtml(formatRecipients(recipients.cc))}</dd>
                </dl>
                <dl class="meta-block">
                  <dt>Bcc</dt>
                  <dd>\${escapeHtml(formatRecipients(recipients.bcc))}</dd>
                </dl>
                <dl class="meta-block">
                  <dt>Envelope</dt>
                  <dd>\${escapeHtml([item.envelopeFrom, item.envelopeTo].filter(Boolean).join(" → ") || "n/a")}</dd>
                </dl>
                <dl class="meta-block">
                  <dt>时间</dt>
                  <dd>\${escapeHtml(formatTime(item.createdAt))}</dd>
                </dl>
                <dl class="meta-block">
                  <dt>Provider Message ID</dt>
                  <dd class="mono">\${escapeHtml(item.providerMessageId || "n/a")}</dd>
                </dl>
                <dl class="meta-block">
                  <dt>Delivery Role</dt>
                  <dd>\${escapeHtml(item.deliveryRole || "n/a")}</dd>
                </dl>
                <dl class="meta-block">
                  <dt>阅读状态</dt>
                  <dd>\${escapeHtml(item.isRead === false ? "未读" : "已读")}</dd>
                </dl>
              </div>

              <section class="message-body">
                \${textPanel || htmlPanel ? "" : \`
                  <section class="body-panel">
                    <h3>Body</h3>
                    <p class="body-text">无正文</p>
                  </section>
                \`}
                \${textPanel}
                \${htmlPanel}
                \${attachmentPanel}
              </section>
            </article>
          \`;

          scheduleAutoRead(item);
          renderList();
        }

        function onReply() {
          const item = state.items.find((entry) => matchesSelectedItem(entry, state.selectedId));
          if (!item || item.direction !== "inbound") return;

          elements.fromInput.value = getPreferredSendMailboxAddress();
          elements.toInput.value = item.fromEmail;
          elements.ccInput.value = "";
          elements.bccInput.value = "";
          elements.subjectInput.value = item.subject.startsWith("Re:") ? item.subject : "Re: " + item.subject;
          elements.bodyInput.value = [
            "",
            "",
            "---- original message ----",
            item.textBody || trimPreview(item.htmlBody || ""),
          ].join("\\n");
          elements.attachmentsInput.value = "";
          setComposeStatus(
            item.attachments?.length > 0
              ? "已把回复对象和主题带入编辑器；原邮件附件不会自动附带。"
              : "已把回复对象和主题带入编辑器。",
            false,
          );
          elements.toInput.focus();
        }

        async function onToggleRead() {
          const item = state.items.find((entry) => matchesSelectedItem(entry, state.selectedId));
          if (!item?.deliveryId) return;

          await setDeliveryReadState(item.deliveryId, item.isRead === false);
        }

        async function onDeleteSelected() {
          const item = state.items.find((entry) => matchesSelectedItem(entry, state.selectedId));
          if (!item?.deliveryId) return;

          elements.deleteButton.disabled = true;
          try {
            const response = await fetch("/api/deliveries/" + encodeURIComponent(item.deliveryId), {
              method: "DELETE",
              headers: { "accept": "application/json" },
            });
            const payload = await response.json();
            if (!response.ok || !payload.ok) {
              throw new Error(payload.error || "delete failed");
            }

            clearReadTimer();
            state.items = state.items.filter((entry) => entry.deliveryId !== item.deliveryId);
            state.selectedId = null;
            const visibleItems = getVisibleItems();
            state.selectedId = visibleItems[0] ? getItemKey(visibleItems[0]) : null;
            renderCounts();
            renderList();
            renderDetail();
            setComposeStatus("已删除当前 mailbox 视图里的邮件。", false);
          } catch (error) {
            const message = error instanceof Error ? error.message : "unknown error";
            setComposeStatus("删除失败: " + message, true);
          } finally {
            elements.deleteButton.disabled = false;
          }
        }

        function onMailboxChange() {
          clearReadTimer();
          state.autoReadSuppressedKey = null;
          state.currentMailbox = elements.mailboxSelect.value || null;
          state.selectedId = null;
          syncCurrentMailbox();
          loadEmails(true);
        }

        function resetCompose(clearStatus = true) {
          elements.composeForm.reset();
          elements.fromInput.value = getPreferredSendMailboxAddress();
          if (clearStatus) setComposeStatus("", false);
        }

        function syncFilterButtons() {
          for (const button of elements.segmentButtons) {
            button.classList.toggle("active", button.dataset.filter === state.filter);
          }
        }

        function setComposeStatus(message, isError) {
          elements.composeStatus.textContent = message;
          elements.composeStatus.classList.toggle("is-error", Boolean(isError));
        }

        function getItemKey(item) {
          return item.deliveryId || item.id;
        }

        function matchesSelectedItem(item, selectedId) {
          if (!selectedId) return false;
          return getItemKey(item) === selectedId || item.id === selectedId;
        }

        function clearReadTimer() {
          if (state.readTimer !== null) {
            window.clearTimeout(state.readTimer);
            state.readTimer = null;
          }
        }

        function scheduleAutoRead(item) {
          clearReadTimer();
          if (!item?.deliveryId || item.isRead !== false) {
            return;
          }
          if (state.autoReadSuppressedKey === getItemKey(item)) {
            return;
          }

          state.readTimer = window.setTimeout(() => {
            setDeliveryReadState(item.deliveryId, true);
          }, 3000);
        }

        async function setDeliveryReadState(deliveryId, read) {
          elements.readToggleButton.disabled = true;

          try {
            const response = await fetch("/api/deliveries/" + encodeURIComponent(deliveryId) + "/read", {
              method: "POST",
              headers: {
                "accept": "application/json",
                "content-type": "application/json",
              },
              body: JSON.stringify({ read }),
            });
            const payload = await response.json();
            if (!response.ok || !payload.ok) {
              throw new Error(payload.error || "read toggle failed");
            }

            state.items = state.items.map((item) =>
              item.deliveryId === deliveryId ? payload.item : item
            );
            if (!read) {
              state.autoReadSuppressedKey = getItemKey(payload.item);
              clearReadTimer();
            } else if (state.autoReadSuppressedKey === getItemKey(payload.item)) {
              state.autoReadSuppressedKey = null;
            }
            renderList();
            renderDetail();
          } catch (error) {
            const message = error instanceof Error ? error.message : "unknown error";
            setComposeStatus("更新阅读状态失败: " + message, true);
          } finally {
            elements.readToggleButton.disabled = false;
          }
        }

        function pickInitialMailbox() {
          const addresses = state.mailboxes
            .map((item) => typeof item?.address === "string" ? item.address : null)
            .filter(Boolean);
          if (addresses.includes(state.currentMailbox)) return state.currentMailbox;
          const sendable = state.mailboxes.filter(isSendableMailbox);
          if (sendable.some((item) => item.address === config.mailFrom)) return config.mailFrom;
          if (sendable[0]?.address) return sendable[0].address;
          return addresses[0] || null;
        }

        function renderMailboxOptions() {
          if (state.mailboxes.length === 0) {
            elements.mailboxSelect.innerHTML = "<option value=''>未配置 mailbox</option>";
            elements.mailboxSelect.disabled = true;
            return;
          }

          elements.mailboxSelect.disabled = false;
          elements.mailboxSelect.innerHTML = state.mailboxes
            .map((item) => {
              const label = item.kind === "virtual"
                ? (item.displayName || item.address)
                : (item.displayName
                    ? item.displayName + " <" + item.address + ">"
                    : item.address);
              return "<option value='" + escapeAttr(item.address) + "'>" + escapeHtml(label) + "</option>";
            })
            .join("");
          elements.mailboxSelect.value = state.currentMailbox || state.mailboxes[0].address;
        }

        function syncCurrentMailbox() {
          const currentMailbox = getCurrentMailbox();
          const sendMailbox = getPreferredSendMailbox();
          const mailbox = sendMailbox?.address || config.mailFrom;
          elements.fromInput.value = mailbox;
          elements.mailFromPill.textContent = mailbox;
          elements.composeHint.textContent = currentMailbox?.sendable === false
            ? "当前视图是未知收件人；发送仍使用真实邮箱账号"
            : "多地址用逗号、分号或换行分隔";
          if (state.currentMailbox) {
            elements.mailboxSelect.value = state.currentMailbox;
          }
        }

        function getCurrentMailbox() {
          return state.mailboxes.find((item) => item?.address === state.currentMailbox) || null;
        }

        function getPreferredSendMailbox() {
          const currentMailbox = getCurrentMailbox();
          if (isSendableMailbox(currentMailbox)) {
            return currentMailbox;
          }
          return state.mailboxes.find((item) => isSendableMailbox(item)) || null;
        }

        function getPreferredSendMailboxAddress() {
          return getPreferredSendMailbox()?.address || config.mailFrom;
        }

        function isSendableMailbox(item) {
          return Boolean(item) && item.sendable !== false;
        }

        function trimPreview(value) {
          return String(value || "").replace(/\\s+/g, " ").trim().slice(0, 140) || "无正文";
        }

        function pickPrimaryRecipient(item) {
          const recipients = normalizeRecipients(item.recipients);
          const primary = recipients.to[0] || recipients.cc[0] || recipients.bcc[0];
          if (!primary) return item.envelopeTo || "(missing recipient)";
          const total = recipients.to.length + recipients.cc.length + recipients.bcc.length;
          return total > 1 ? primary + " +" + String(total - 1) : primary;
        }

        function normalizeRecipients(value) {
          return {
            to: Array.isArray(value?.to) ? value.to : [],
            cc: Array.isArray(value?.cc) ? value.cc : [],
            bcc: Array.isArray(value?.bcc) ? value.bcc : [],
          };
        }

        function normalizeAttachments(value) {
          return Array.isArray(value) ? value : [];
        }

        function formatRecipients(values) {
          return values.length > 0 ? values.join(", ") : "n/a";
        }

        function formatAttachmentMeta(attachment) {
          const parts = [];
          if (attachment.contentType) parts.push(attachment.contentType);
          if (typeof attachment.size === "number") parts.push(formatBytes(attachment.size));
          return parts.join(" · ") || "attachment";
        }

        function formatBytes(value) {
          if (!Number.isFinite(value) || value < 1024) return String(value) + " B";
          if (value < 1024 * 1024) return (value / 1024).toFixed(1) + " KB";
          return (value / (1024 * 1024)).toFixed(1) + " MB";
        }

        function formatTime(value) {
          if (!value) return "unknown";
          const date = new Date(value.replace(" ", "T") + "Z");
          if (Number.isNaN(date.getTime())) return value;
          return new Intl.DateTimeFormat("zh-CN", {
            dateStyle: "medium",
            timeStyle: "short",
          }).format(date);
        }

        function escapeHtml(value) {
          return String(value)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#39;");
        }

        function escapeAttr(value) {
          return escapeHtml(value).replaceAll("\\n", "&#10;");
        }
      })();
    </script>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeForInlineScript(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("\"", "\\\"")
    .replaceAll("</script", "<\\/script")
    .replaceAll("\n", "\\n")
    .replaceAll("\r", "\\r")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}
