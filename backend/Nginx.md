# AI Skin 服务端架构与 Nginx 强制规则

> 本文是 AI Skin 后端、Nginx 和生产发布的约束文档。任何人或 Agent 修改相关代码、配置或部署方式前，必须先阅读并遵守。  
> 关键词含义：**MUST/必须**为不可违反；**MUST NOT/禁止**为绝对禁止；**SHOULD/应当**只有在记录理由和风险后才可偏离。

## 1. 规则优先级和适用范围

本文适用于：

- `backend/` 下的启动流程、路由、认证、AI provider、存储和健康检查。
- Nginx 站点配置、TLS、反向代理、静态页面和上传策略。
- PM2/systemd、环境变量、部署、回滚和生产日志。
- 手机号登录、Sign in with Apple、账号删除和模型切换。

冲突时优先级为：用户最新明确要求 > 安全/隐私和不可破坏接口 > 本文 > 临时实现习惯。任何偏离本文的变更必须在 MR/PR 描述中写明原因、影响、测试和回滚方案。

## 2. 固定生产拓扑

```text
iOS / Web
    |
    | HTTPS :443
    v
Nginx
    |-- compliance static pages
    |-- web SPA static files
    `-- /api/* -> http://127.0.0.1:5000/api/*
                         |
                         |-- MongoDB
                         |-- DashScope AI
                         |-- Apple identity servers
                         `-- private object storage
```

强制规则：

- Node MUST 只监听 `127.0.0.1:5000` 或 Unix socket，MUST NOT 暴露公网端口。
- 外部流量 MUST 只通过 Nginx 的 443 入口；80 只用于跳转 HTTPS/证书验证。
- `/api` 路径 MUST 原样传给 Node，MUST NOT 被 Nginx 去除、替换或改成 `/v1`。
- MongoDB、对象存储密钥、AI 密钥和 Apple 私钥 MUST NOT 出现在 Nginx 配置或代码仓库。
- 当前为模块化单体。未经明确架构决策，MUST NOT 拆成多个公网微服务。

## 3. 后端分层规则

- `app.js` MUST 只创建 Express app、注册通用中间件、路由、404 和统一错误处理。
- `index.js` MUST 负责配置校验、数据库连接、listen、信号和优雅退出。
- controller MUST 只处理 HTTP 输入输出并调用 service，MUST NOT 直接访问 OSS、AI 或 Mongoose。
- service MUST 承担业务规则、权限和 provider 编排，MUST NOT 依赖 `req/res`。
- provider MUST 封装 DashScope、Apple、OSS 等外部协议，MUST NOT 决定 HTTP 响应。
- route MUST 在 controller 前完成认证和 schema 校验。
- 所有异常 MUST 进入统一 error handler；生产响应 MUST NOT 泄露 stack、Mongo URI 或上游原始错误。
- 数据库和关键配置初始化失败时进程 MUST 非零退出，MUST NOT 在半可用状态监听端口。

## 4. API 兼容规则

- 生产 API 基地址 MUST 保持 `https://www.lunzo.site/api`，直到一次明确的客户端版本迁移。
- 现有 route、method、multipart 字段和客户端依赖的响应字段 MUST 保持兼容。
- `faceImage` MUST 继续作为皮肤分析上传字段名。
- 成功响应 SHOULD 保持 `{ success: true, message?, token?, data? }`。
- 错误响应 MUST 至少包含 `{ success: false, message }`；可增加稳定 `code` 和 `requestId`。
- URL 中的 `userId` MUST NOT 被当作授权依据。所有用户数据 MUST 以 JWT 解析出的当前用户 ID 过滤。
- 修改或删除接口前 MUST 先提供 iOS 迁移版本、兼容窗口和 contract test；MUST NOT 服务端单方面破坏。

## 5. 认证规则

### 5.1 共同规则

- 手机号/密码和 Sign in with Apple MUST 同时可用。
- 首发认证方式 MUST 只包含上述两套；iOS 中现存的可选 email 字段不等于已启用邮箱认证，未经独立验证与契约设计 MUST NOT 把 email 扩成第三套登录方式。
- 两种登录 MUST 映射到本地 User，并签发同一种应用 JWT。
- 后续业务接口 MUST 只接受本应用 JWT，MUST NOT 直接接受 Apple identity token。
- JWT secret MUST 由生产 secrets 提供；缺失时 MUST 拒绝启动；MUST NOT 存在默认 secret。
- 日志 MUST NOT 记录密码、Authorization、完整手机号、应用 JWT、Apple token/code、refresh token 或 nonce。
- 登录、注册、密码重置、Apple 验证 MUST 有 IP/账号维度限流和审计计数。

### 5.2 手机号规则

- `/api/users/register` 和 `/api/users/login` MUST 保持兼容。
- 手机号 MUST 在入库和查询前统一规范化；格式策略变更前 MUST 有旧数据迁移。
- 密码 MUST 使用当前认可的强哈希算法和成本参数；MUST NOT 明文存储或返回。
- 密码重置 MUST 验证真实一次性验证码，并限制有效期、尝试次数和发送频率。

### 5.3 Apple 规则

- Apple 原生入口 MUST 使用 `POST /api/users/apple`。
- 服务端 MUST 验证 Apple JWT 签名、`kid/alg`、`iss`、`aud`、`exp`、`nonce` 和 `sub`。
- `aud` MUST 是已配置的 Bundle ID `personal.AIskin`，不得相信客户端传入的 audience。
- 用户身份 MUST 以验证后的 `sub` 为键，MUST NOT 按 email 自动绑定或合并。
- `authorizationCode` MUST 在服务端使用，MUST NOT 发送给其他客户端或写日志。
- Apple 首次授权提供的姓名 SHOULD 只用于填补空资料或系统占位名，MUST NOT 覆盖用户已编辑的姓名；API 返回的 `user.name` MUST 保持非空以兼容当前 iOS DTO。
- 绑定 Apple 到已有用户时 MUST 要求当前应用 JWT，并再次完整验证 Apple 凭证。
- 删除账号时，若保存了 Apple refresh token，MUST 调用 Apple revoke；refresh token MUST 加密保存且 `select: false`。
- Apple capability、entitlement、Team/Bundle 配置和服务端私钥 MUST 在 staging 真机验收，不能仅靠 mock 判定完成。

## 6. AI 模型规则

- 上线文本模型基线 MUST 为 `qwen3.7-flash`，视觉模型基线 MUST 为 `qwen3-vl-plus`，OCR 模型基线 MUST 为 `qwen-vl-ocr-latest`，除非经过记录的评测和发布审批。
- 模型 ID MUST 来自 `AI_TEXT_MODEL`、`AI_VISION_MODEL`、`AI_OCR_MODEL` 或统一 model registry，MUST NOT 散落硬编码在 controller/service。
- plan、conflict、ingredient MUST 使用文本任务映射；skin-analysis MUST 使用视觉任务映射；OCR MUST 使用独立 OCR 任务映射。
- 每个任务 MUST 有独立 promptVersion、输出 schema 和校验。
- AI 输出不合法时 MUST 返回明确失败或执行受控重试，MUST NOT 生成虚假健康分、虚假建议或其他默认业务结论后返回成功。
- 自动切换到另一模型/provider 前 MUST 有 golden eval；未经评测 MUST NOT 自动 fallback。
- AI 请求 MUST 有连接/读取/总时限和有界重试，MUST NOT 无限等待或无限重试。
- 日志 MAY 记录 provider、model、promptVersion、schemaVersion、耗时、token usage、状态；MUST NOT 记录人脸 URL、原始图片、敏感 prompt 或完整原始输出。

## 7. 对象存储和隐私规则

- 人脸原图 MUST 使用私有对象存储，MUST NOT 设置 `public-read`。
- 人脸图 MUST NOT 通过 Nginx `/uploads`、静态目录或永久 URL 公开。
- AI 访问人脸图 MUST 使用短时签名 URL 或受控字节流；签名 URL MUST NOT 写日志。
- 删除皮肤分析或账号时 MUST 删除对应对象；失败 MUST 记录可重试补偿任务。
- 产品包装图和人脸图 MUST 使用不同的访问策略，SHOULD 使用不同前缀或 bucket。
- 上传 MUST 同时校验 Content-Type、真实文件签名、大小和允许的扩展名；MUST NOT 只相信文件名。
- 应用层 multer 限制 MUST 保留，即使 Nginx 的总上限更大。

## 8. Nginx 必须满足的配置行为

下面是行为基线，不是可直接复制的完整生产证书配置：

```nginx
server {
    listen 80;
    server_name www.lunzo.site lunzo.site;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name www.lunzo.site lunzo.site;

    client_max_body_size 20m;

    # 隐私政策、服务条款等精确静态路由必须放在 SPA fallback 之前。

    location /api/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Request-ID $request_id;

        proxy_connect_timeout 5s;
        proxy_send_timeout 30s;
        proxy_read_timeout 120s;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

强制解释：

- `proxy_pass` MUST 保留 `/api`。使用尾斜杠造成 URI 替换前，必须用真实请求验证；默认采用上例无尾斜杠 upstream URI。
- 合规静态页面的精确 `location` MUST 放在 SPA fallback 前，避免被 `index.html` 吞掉。
- `client_max_body_size` SHOULD 为 20 MB 总保险，但业务上传中间件 MUST 使用更小的按接口限制（当前目标 5–10 MB）。
- 同步 AI 首发阶段建议 `connect=5s`、`send=30s`、`read=120s`；改动时 MUST 同时核对 Node/provider 总超时，避免 Nginx 先断而 Node 继续计费。
- 当前没有 WebSocket 时 MUST NOT 无条件添加 `Upgrade`/`Connection: upgrade`。真正增加 WebSocket 路由后仅对对应 location 配置。
- Nginx MUST 透传或生成 request ID，Node MUST 将其放入结构化日志和安全错误响应。
- HTTPS MUST 使用有效证书和安全协议。HSTS SHOULD 在 HTTPS 稳定且确认所有子域策略后开启，避免错误长时间缓存。
- `/health` 和 `/ready` MAY 由公网监控访问，但返回内容 MUST 最小化；需要时可通过 allowlist 或独立监控网络限制。
- `/uploads` MUST NOT 暴露人脸图片。若为兼容产品图保留，MUST 证明目录不含人脸、token、临时文件或用户私密数据。

## 9. 超时与容量预算

同步首发的单请求预算必须从外到内递减：

```text
Nginx read timeout 120s
  > Node request budget 110s
    > AI provider total budget 100s
      > 单次 AI call + 有界 retry
```

- 内层总时限 MUST 小于外层时限，给错误转换和响应传输留余量。
- 数据库查询 SHOULD 有明确 maxTimeMS 或服务级预算。
- 任何外部 HTTP client MUST 显式设置 timeout；MUST NOT 依赖库的无限默认值。
- 当 p95 接近预算或并发造成阻塞时，SHOULD 迁移到任务队列；MUST NOT 只继续放大 Nginx timeout。

## 10. 健康检查规则

- `GET /health` MUST 只检查进程可响应，正常返回 200；MUST NOT 每次调用 MongoDB、AI、Apple 或 OSS。
- `GET /ready` MUST 在配置、MongoDB 或初始化未完成时返回非 200；MUST NOT 泄露依赖地址和密钥。
- Nginx/负载均衡摘流 SHOULD 使用 `/ready`，进程存活监控 SHOULD 使用 `/health`。
- 发布脚本 MUST 在 reload 后验证两者；仅看到 PM2 `online` 不代表服务可用。

## 11. 日志与监控规则

生产日志 MUST 使用结构化字段，至少包含：

- timestamp、level、requestId、route、method、statusCode、durationMs。
- 认证结果类别和稳定错误码；手机号只允许不可逆哈希或脱敏尾号。
- AI 调用的 provider/model/promptVersion/status/duration/usage。

生产日志 MUST NOT 包含：

- Authorization header、JWT、密码、短信验证码。
- Apple identity token、authorization code、refresh token、raw nonce。
- 完整手机号、Mongo URI、密钥、cookie。
- 人脸图片、永久/签名 URL、原始 base64。
- 包含个人信息的完整 prompt、原始 AI 输出或异常对象 dump。

监控至少 SHOULD 覆盖 5xx、401/403、429、AI schema failure、AI timeout、Mongo connection、对象删除失败、Apple 验证失败和 p50/p95/p99 延迟。

## 12. 生产变更流程

任何生产变更 MUST 按以下顺序：

1. 确认部署分支、commit、目标服务器和当前线上版本。
2. 备份当前 release、Nginx 配置、PM2 配置和环境变量键名清单；MUST NOT 输出秘密值。
3. 在隔离 release 目录安装锁定依赖：`npm ci`，MUST NOT 在正在运行目录随意 `npm install`。
4. 运行 lint/语法检查、unit、integration、contract 和必要的 AI eval。
5. 对 Nginx 变更执行 `nginx -t`；失败 MUST 终止发布。
6. 使用 PM2 graceful reload 或等价零/低停机方式切换；MUST NOT 先杀掉唯一稳定实例再调试。
7. 验证 `/health`、`/ready` 和下面的 smoke 清单。
8. 观察核心指标和日志；超阈值立即按备份回滚。
9. 记录部署 commit、配置版本、操作者、时间、验证结果和回滚点。

禁止事项：

- MUST NOT 在没有备份和 `nginx -t` 的情况下修改/重载 live Nginx。
- MUST NOT 用未对齐的本地 `main` 覆盖线上目录。
- MUST NOT 把 `.env`、Apple 私钥或证书提交到 Git。
- MUST NOT 在生产直接运行会自动发现并调用真实外部服务的历史测试脚本。
- MUST NOT 在同一次发布里混入无关依赖升级、路由改名和数据破坏性迁移。

## 13. 必做 Smoke 清单

发布后必须验证：

- `GET /health` 返回 200。
- `GET /ready` 返回 200，MongoDB 真实可用。
- 旧手机号注册/登录和 `GET /api/users/me` 正常。
- `/api/users/apple` 对伪造、过期、错误 audience/nonce token 返回 401，不创建用户。
- staging 真机 Apple 首登和复登返回与手机号登录相同结构的应用 JWT。
- 上传合法产品图、人脸图成功；超限和非图片被拒绝。
- 人脸对象无法匿名公网访问。
- 一个用户无法通过替换 product/conflict/skin-analysis ID 访问另一个用户数据。
- 文本与视觉任务实际使用配置模型，AI 非法 JSON 不返回伪造成功。
- 删除皮肤分析后 Mongo 记录和私有对象都被清理。
- 删除 Apple 用户后会话失效，并完成或排队 Apple revoke 和数据清理。
- 合规静态页面与 SPA 都能访问，`/api` 没有被 SPA fallback 接管。

## 14. 回滚规则

- 每次发布 MUST 有明确的上一代码 release、上一 Nginx 配置和上一非秘密配置版本。
- 数据库迁移 MUST 优先 additive、向后兼容；破坏性字段删除 MUST 延迟到旧代码不再运行之后。
- 模型回滚 MUST 只需恢复上一 `AI_TEXT_MODEL/AI_VISION_MODEL/AI_OCR_MODEL` 并 reload，不依赖 iOS 发版。
- Apple 登录故障时 MAY 通过 feature flag 临时关闭 Apple 按钮/接口，但 MUST 保持手机号登录可用。
- 回滚后 MUST 重新执行 health/ready、手机号登录和核心业务 smoke，并记录故障原因。

## 15. 变更审查清单

每个后端/Nginx MR 或发布说明必须回答：

- 是否改变现有 iOS 路径、方法、字段、状态码或 JSON 外壳？
- 是否改变认证、资源归属、Apple claims 校验或账号绑定？
- 是否改变模型、prompt、schema、超时、重试或降级？
- 是否处理人脸图、手机号、token、密钥或其他隐私数据？
- 是否需要 Mongo 索引/迁移，能否与上一版本同时运行？
- 是否通过 contract/security/AI eval 和真实 smoke？
- Nginx 是否已备份并通过 `nginx -t`？
- 精确回滚步骤是什么，回滚后数据是否仍兼容？

任何一项回答不清楚时，该变更 MUST NOT 直接进入生产。
