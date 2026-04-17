# Cloudflare Mail 多账号 Spike 记录

最后验证时间：2026-04-17 22:17:50 +08

## 1. 目标

这个项目的目标不是做 IMAP/SMTP 兼容邮件服务，也不是做完整邮箱 SaaS，而是验证下面这件事能不能闭环：

- Cloudflare Email Routing 把 `brightex.cc` 的收件路由到一个 Worker
- Worker 把入站邮件落到 D1
- Web 页面直接从 D1 读 mailbox 视图
- Web 页面也能通过 `send_email` binding 主动发信
- 同一个域名下支持多个本地邮箱账号

当前已经落地的本地账号：

- `inbox@brightex.cc`
- `tom@brightex.cc`
- `jerry@brightex.cc`

Web 入口：

- `https://mail.brightex.cc`

Worker 名称：

- `brightex-mailbox`

D1 名称：

- `brightex-mailbox`

## 2. 为什么单表模型不够

最早的 spike 是单邮箱模型，只有一张 `emails` 表。这个模型有一个隐藏假设：

- “一封邮件只属于一个本地邮箱视图”

这个假设在多邮箱场景下立即失效。原因有两个：

1. 同一封入站邮件可能同时投递给多个本地账号。
2. 同一封邮件的“消息事实”和“某个 mailbox 看到它”不是一个概念。

如果继续把 mailbox 归属硬塞进 `emails`，会出现两个问题：

- 同一封消息会被重复存多份正文
- mailbox 切换会退化成“每个邮箱复制一套消息事实”

所以需要拆边界：

- `emails` 只表示消息事实
- `mailboxes` 表示本地账号
- `mailbox_deliveries` 表示“某封消息出现在某个 mailbox 的某个 folder 里”

这就是这次多账号改造的核心重写边界。

## 3. 数据模型

### 3.1 `emails`

保留为唯一事实源，记录：

- 方向：`inbound` / `outbound`
- 来源：`email_handler` / `http_api` / `auto_reply`
- 状态：`received` / `pending` / `sent` / `failed`
- 发件人
- 收件人结构：`to` / `cc` / `bcc`
- 主题、正文、HTML、envelope 信息
- `provider_message_id`

这里的关键点是：

- `emails` 不再表达“属于哪个 mailbox”

### 3.2 `mailboxes`

保存本地邮箱账号元数据：

- `address`
- `local_part`
- `domain`
- `display_name`

当前 migration 默认插入：

- `inbox@brightex.cc`
- `tom@brightex.cc`
- `jerry@brightex.cc`

### 3.3 `mailbox_deliveries`

这是多账号视图真正的核心表，保存：

- `mailbox_id`
- `message_id`
- `folder`：`inbox` / `sent`
- `delivery_role`：`to` / `cc` / `bcc` / `null`
- `delivered_at`

唯一约束：

- `(mailbox_id, message_id, folder)`

这个约束保证：

- 同一个 mailbox 的同一个 folder，不会对同一消息重复插入 delivery

## 4. 入站收件链路

入口在 Worker 的 `email(message, env)`。

完整路径如下：

1. Cloudflare Email Routing 把入站邮件交给 Worker
2. Worker 读取原始 RFC822 数据
3. 用 `postal-mime` 解析头、正文、HTML、收件人
4. 生成 `EmailRecord`
5. 如果存在 `provider_message_id`，先按它做入站去重
6. 去重未命中时写入 `emails`
7. 计算这封邮件应该出现在哪些本地 mailbox
8. 对每个 mailbox 写入一条 `mailbox_deliveries(folder='inbox')`
9. 如果开启自动回执，再走统一的 `sendAndStore()`

### 4.1 为什么要按 `provider_message_id` 去重

同一封真实邮件可能通过不同本地收件地址多次触发 Worker。

例如：

- 第一轮投递命中 `tom@brightex.cc`
- 第二轮投递命中 `jerry@brightex.cc`

如果不去重，会在 `emails` 里写出两条内容完全一样的入站消息。

正确做法是：

- `emails` 只存一条
- `mailbox_deliveries` 为 `tom`、`jerry` 分别建视图关系

### 4.2 `delivery_role` 怎么推导

推导规则：

- 在 `to` 里出现，记为 `to`
- 在 `cc` 里出现，记为 `cc`
- 在 `bcc` 里显式出现，记为 `bcc`
- 只命中 envelope `to`，但不在头里出现，也按 `bcc` 处理

原因很简单：

- 这类邮箱通常是被隐送到本地 mailbox，但不会出现在可见头部收件人中

## 5. 主动发信链路

主动发信入口是 `POST /api/send`。

路径如下：

1. Web UI 组装 `from/to/cc/bcc/subject/body`
2. Worker 在 HTTP 边界做一次收件人标准化
3. 先插入一条 `emails(status='pending', direction='outbound')`
4. 调用 `env.SEND_EMAIL.send(...)`
5. 成功后把 `emails.status` 更新为 `sent`
6. 如果 `from` 对应本地 mailbox，则写入一条 `mailbox_deliveries(folder='sent')`

这里的关键点是：

- “发件箱可见性”不是从 HTTP payload 直接推出来的
- 而是从 `from` 是否属于本地 `mailboxes` 推出来的

所以：

- 以 `tom@brightex.cc` 发信，`tom` 的 `sent` 里可见
- 以一个非本地域名地址发信，不会出现在任何本地 `sent`

## 6. Web 页面为什么能“收邮件”

Web 页面本身并不直接接 SMTP，也不保持长连接收信。

它的工作方式其实很简单：

1. 邮件先走 Cloudflare Email Routing -> Worker `email()`
2. Worker 把消息写入 D1
3. Web 页面加载时先请求 `GET /api/mailboxes`
4. 用户在顶部选择一个 mailbox
5. 页面再请求 `GET /api/emails?mailbox=<address>`
6. Worker 从 `mailbox_deliveries + emails + mailboxes` 联表返回当前 mailbox 的视图

所以页面“收邮件”的本质是：

- 读 D1 里的 mailbox 视图，不是直接监听收件协议

## 7. 顶部邮箱切换是怎么做的

前端这次最关键的改动不是样式，而是状态模型：

- 引入唯一状态源 `state.currentMailbox`

以下行为全部从它派生：

- 邮件列表查询参数 `?mailbox=...`
- 发件表单默认 `from`
- 回复时默认 `from`
- 详情区标题里的当前 mailbox

这样可以避免出现两份真相：

- UI 看的是 `tom`
- 发件表单却还停留在 `inbox`

这个问题如果不统一状态源，后面只会越来越难排。

## 8. D1 migration 演进

### 8.1 `0001_init.sql`

最早的单邮箱版本，只有 `emails`。

### 8.2 `0002_recipients_model.sql`

把早期单一 `to_json` 重构成：

- `recipients_json = { to, cc, bcc }`

这是支持多人收件、`cc`、`bcc` 的必要前置。

### 8.3 `0003_mailboxes.sql`

新增：

- `mailboxes`
- `mailbox_deliveries`

并且插入三条默认 mailbox。

这是多账号视图真正落地的那一步。

## 9. 本地验证怎么做

`scripts/verify-local.sh` 现在验证的是多账号闭环，不是旧的单邮箱闭环。

它会做这些事：

1. 本地应用 migrations
2. 启动 `wrangler dev`
3. 请求 `/api/mailboxes`，断言有 `inbox/tom/jerry`
4. 通过 `/cdn-cgi/handler/email` 注入测试邮件到 `tom`
5. 再把同一封测试邮件注入到 `jerry`
6. 验证全局列表里有入站记录和自动回执记录
7. 验证 `tom` mailbox 能看到自己的 `inbox` delivery
8. 再用 `tom@brightex.cc` 主动发一封信
9. 验证 `tom` 的 `sent` 里能看到这封 outbound

这个脚本覆盖的不是 UI 视觉，而是核心数据不变量：

- mailbox 视图是否成立
- sent/inbox 是否都落到了正确 mailbox

## 10. Cloudflare 资源与配置

### 10.1 Worker

- 名称：`brightex-mailbox`
- 自定义域名：`mail.brightex.cc`

### 10.2 Send Email binding

Wrangler 配置：

- `send_email: [{ name: "SEND_EMAIL" }]`

Worker 通过 `env.SEND_EMAIL.send(...)` 主动发信。

### 10.3 D1

- 名称：`brightex-mailbox`

本地 `wrangler.jsonc` 里必须填真实 `database_id`。

### 10.4 账号选择

因为当前 Wrangler 登录下能访问多个 Cloudflare 账号，所以 `wrangler.jsonc` 必须有：

- `account_id`

否则远端 `wrangler` 在非交互模式下无法知道该对哪个账号 deploy。

## 11. 这次开发过程中踩到的坑

### 11.1 远端脚本拿不到登录态

仓库早期脚本为了隔离本地环境，把 `HOME` 改到了项目内 `.home`。

这对本地 `wrangler dev` 没问题，但对远端命令有致命副作用：

- `wrangler deploy`
- `wrangler d1 migrations apply --remote`

它们会丢失你本机真实的 Wrangler 登录态。

修复：

- 保留 `dev` / `local migration` 使用项目内 `HOME`
- `deploy` 和 `db:migrate:remote` 改回直接使用本机 `wrangler`

### 11.2 `wrangler.jsonc` 一直是占位 D1 id

早期本地配置没有把真实 `database_id` 填回去，结果远端 migration 一直打到 `00000000-0000-0000-0000-000000000000`。

修复：

- 在 Frankie 账号里确认真实 D1 uuid
- 本地未跟踪 `wrangler.jsonc` 回填真实值

### 11.3 线上邮箱下拉为空

这个不是 API 没数据，而是前端脚本根本没执行成功。

具体原因：

- `src/ui.ts` 是用 TypeScript 模板字符串生成整页 HTML
- 在内联脚本里又拼接了一层 JS 字符串
- 新增 mailbox chip 和 `<option>` 时，引号层级没有处理好
- 浏览器最终拿到的是非法 JS，比如：

`"<span class="chip">"`

于是整段脚本在解析阶段直接抛 `SyntaxError`，`boot()` 根本没执行，所以 mailbox 下拉始终为空。

修复方式：

- 把内层 HTML 字符串的属性引号统一改成单引号
- 对生成后的整段脚本再做一次 `new Function(...)` 语法校验
- 修好后重新 deploy

这个坑说明：

- TypeScript `check` 只能保证外层模板合法
- 不能保证模板生成出来的浏览器脚本本身也合法

## 12. 当前线上验证结果

已验证：

- `https://mail.brightex.cc/api/mailboxes` 返回 `inbox/tom/jerry`
- `https://mail.brightex.cc/` 产出的内联脚本语法有效
- 页面源码包含顶部 mailbox selector

最近一次线上 deploy 版本：

- Worker version id: `eaac17f3-8f55-41e7-b69a-045f295c3e5a`

## 13. 仍然刻意没做的部分

这次 spike 明确没做下面这些东西：

- 登录 / 权限控制
- 每个 mailbox 的密码体系
- IMAP / SMTP / POP3 客户端兼容
- 富文本编辑器
- 搜索、线程、附件管理
- catch-all 后的动态 mailbox 自助创建

原因不是做不到，而是当前目标只验证：

- Cloudflare Worker + Email Routing + Send Email + D1
- 在同一域名下支撑多个网页邮箱账号

这条最小闭环现在已经成立。
