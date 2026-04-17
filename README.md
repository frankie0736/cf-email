# Cloudflare Mail Spike

一个最小可跑的 Cloudflare 邮件收发原型：

- 入站邮件通过 Email Routing 进入 Worker `email()` 入口
- 邮件事实存到 D1
- 附件二进制存到 R2，元数据存到 D1
- Web UI 直接读 Worker API 展示多邮箱视图
- 主动发信通过 `send_email` binding

这个仓库是 spike，不是完整邮件服务商实现。目标是先验证“多账号 Web Mail + Cloudflare 全家桶”闭环。

## 当前能力

- 多本地邮箱账号视图
- `To` / `Cc` / `Bcc`
- 收件、发件、回复
- 每 mailbox 视图独立的已读 / 未读 / 删除状态
- 打开邮件 3 秒自动标记已读，也支持手动切换
- 附件收发
- 附件下载走 Worker 中转，不暴露 R2 直链
- `catch-all` 下的未知收件人视图
- 自动回执默认关闭

## 架构

不变量：

- `emails` 只存消息事实
- `mailboxes` 表达可切换的 mailbox view，既可以是真实账号，也可以是虚拟视图
- `mailbox_deliveries` 只存某个 mailbox view 下的收件箱/发件箱状态
- 已读 / 删除状态只挂在 `mailbox_deliveries`，不回写消息事实

数据流：

1. 外部邮件进入 Cloudflare Email Routing
2. Routing 把邮件投给 Worker
3. Worker 解析原始邮件并写入 D1 / R2
4. Worker 根据本地 `mailboxes` 生成收件箱视图
5. Web 页面通过 `/api/mailboxes` 和 `/api/emails` 读取列表
6. 主动发信通过 `/api/send` 调用 `send_email`

## 目录

- `src/index.ts`
  Worker HTTP API、Email Handler、D1/R2 读写
- `src/ui.ts`
  极简单页 Web UI
- `migrations/`
  D1 表结构迁移
- `samples/`
  本地验收用邮件样本
- `scripts/verify-local.sh`
  本地闭环验证脚本
- `wrangler.example.jsonc`
  可公开提交的配置模板

## 快速开始

### 1. 安装依赖

```bash
bun install
```

### 2. 生成本地配置

```bash
cp wrangler.example.jsonc wrangler.jsonc
```

然后在本地 `wrangler.jsonc` 里填真实值：

- `account_id`
- `d1_databases[0].database_id`
- 需要的话补 `r2_buckets`、`routes`、自定义域名等

注意：

- `wrangler.jsonc` 只在本地保留，不进 Git
- 仓库里只跟踪 `wrangler.example.jsonc`

### 3. 创建 Cloudflare 资源

至少需要：

- 1 个 Worker
- 1 个 D1 数据库
- 1 个 R2 bucket
- 1 个 `send_email` binding
- 1 条 Email Routing 规则

推荐最简配置：

- 一个 `catch-all -> Worker`

这样所有 `*@your-domain.example` 的入站邮件都会进 Worker，再由应用侧判断：

- 是不是本地已知邮箱
- 是否应该进真实 mailbox
- 是否应该落到“未知收件人”视图

### 4. 执行数据库迁移

本地：

```bash
bun run db:migrate:local
```

远端：

```bash
bun run db:migrate:remote
```

### 5. 本地运行

```bash
bun run dev
```

默认访问：

```bash
http://127.0.0.1:8787
```

### 6. 本地验证

```bash
bun run check
bun run verify:local
```

`verify:local` 会验证这些闭环：

- UI 首页能打开
- `/api/mailboxes` 返回真实邮箱 + 未知收件人虚拟视图
- 本地入站邮件能进入 `inbox` / `tom` / `jerry`
- `catch-all` 的未知地址能进入“未知收件人”
- 附件能写入并通过 Worker 下载
- 主动发信能进入对应 `sent` 视图

## Email Routing 配置原则

最小原则：

- 如果所有地址都要进同一个 Worker，用 `catch-all -> Worker` 就够了
- 不要再额外保留“同目标、同动作”的单地址重复规则

规则分工：

- Cloudflare Routing 负责把邮件送进 Worker
- Worker 负责决定这封邮件属于哪个本地 mailbox 视图

## 本地邮箱与未知收件人

本地账号存放在 `mailboxes` 表里，例如：

- `inbox@your-domain.example`
- `tom@your-domain.example`
- `jerry@your-domain.example`

如果邮件被 `catch-all` 收进来，但收件地址不在 `mailboxes` 表里：

- 邮件事实仍然会保存在 `emails`
- 不会伪造一个新的真实邮箱账号
- UI 会把它归到“未知收件人”这个虚拟视图

这样不会污染真实账号模型。

## 常用命令

```bash
bun run check
bun run dev
bun run deploy
bun run db:migrate:local
bun run db:migrate:remote
bun run verify:local
```

## HTTP API

健康检查：

```bash
curl "http://127.0.0.1:8787/health"
```

列出 mailbox 视图：

```bash
curl "http://127.0.0.1:8787/api/mailboxes"
```

查看某个 mailbox：

```bash
curl "http://127.0.0.1:8787/api/emails?limit=20&mailbox=tom@your-domain.example"
curl "http://127.0.0.1:8787/api/emails?limit=20&mailbox=__unknown__"
```

标记已读 / 未读：

```bash
curl \
  --request POST "http://127.0.0.1:8787/api/deliveries/<delivery-id>/read" \
  --header "Content-Type: application/json" \
  --data '{"read":true}'
```

删除当前 mailbox 视图中的一封邮件：

```bash
curl \
  --request DELETE "http://127.0.0.1:8787/api/deliveries/<delivery-id>"
```

主动发信：

```bash
curl \
  --request POST "http://127.0.0.1:8787/api/send" \
  --header "Content-Type: application/json" \
  --data '{
    "from": "tom@your-domain.example",
    "to": ["alice@example.com", "bob@example.com"],
    "cc": "copy@example.com",
    "bcc": "blind@example.com",
    "subject": "hello",
    "text": "hello from cloudflare worker"
  }'
```

## 部署

```bash
bun run deploy
```

部署前确认：

- D1 / R2 / `send_email` binding 已在 `wrangler.jsonc` 正确绑定
- 自定义域名或 `workers.dev` 路由已配置
- 目标域名的 Email Routing 已指向当前 Worker

## 安全与边界

- 不要把 `wrangler.jsonc`、账号 ID、数据库 ID、令牌提交进仓库
- 附件下载不要暴露 R2 公网链接
- 当前 UI 没有登录鉴权，只适合 spike / 内部验证
- 当前实现不是 IMAP / SMTP 替代品，也不面向传统邮件客户端

## 后续方向

- 增加登录和权限模型
- 多域名支持
- 线程视图
- 搜索与筛选
- 垃圾邮件与拒收策略
- 未知收件人的显式拒收或隔离策略
