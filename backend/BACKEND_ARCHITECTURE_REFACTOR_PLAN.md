# AI Skin 后端渐进式重构方案

> 状态：拟定实施基线  
> 日期：2026-08-25  
> 目标：优先轻量上线，保留现有 iOS API 契约，同时为 Apple 登录、模型切换和后续异步化留出清晰边界。

## 1. 最终技术决策

唯一参考项目锁定为 [hagopj13/node-express-boilerplate](https://github.com/hagopj13/node-express-boilerplate)（2026-08-25 查询为 7,667 stars）。选择它的原因是它与本项目的 JavaScript、Express、Mongoose 技术栈最接近，并且已经形成可直接借鉴的 `app / config / controllers / services / models / routes / validations / tests` 边界。

本项目只借鉴它的工程结构和职责划分，不复制其旧依赖版本，不改用它的 `/v1` 路由前缀，也不照搬它的响应格式。AI Skin 继续使用 Express + MongoDB，并保持现有 `/api` 路径和 `{ success, message?, token?, data? }` 响应外壳。

本轮明确不做：

- 不迁移 NestJS、TypeScript、微服务或其他数据库。
- 不在上线前强行引入 Redis、BullMQ、Kafka。
- 不改变 iOS 当前生产基地址 `https://www.lunzo.site/api`。
- 不把已有接口整体改名为 `/v1` 或新的 REST 命名。
- 不让 iOS 直接持有大模型或 Apple 的服务端密钥。
- 不为追求“架构完整”一次性重写全部业务。

## 2. 现状判断

当前项目能运行，但主要问题是职责混杂，而不是 Express 选型错误：

- `server.js` 同时创建应用、连接数据库、注册中间件、挂路由、处理错误和监听端口；数据库失败时仍可能继续监听。
- controller 同时承担 HTTP、校验、业务编排、MongoDB、OSS、大模型调用、结果解析与响应拼装。
- AI 调用散落在多个业务文件中，模型名、超时、输出校验和日志策略没有统一入口。
- 当前 `User` 模型要求手机号、密码、姓名和性别全部必填，无法兼容 Apple 用户。
- 多个按 `userId` 或资源 ID 查询的接口没有统一执行资源归属校验。
- 人脸图片与原始 AI 输出存在隐私泄露风险；AI 解析失败后生成“看似合理”的默认结果会掩盖真实故障。
- 测试以手动脚本为主，没有稳定保护 iOS 契约的集成测试。
- 缺少 `/health`、`/ready`、启动配置校验、优雅退出和可回滚的部署规则。

因此采用“模块化单体 + 渐进迁移”。上线阶段保持一个 Node 服务、一个 MongoDB、一个 Nginx 入口，先把边界和安全性做正确。

## 3. 开始改造前必须对齐的源码基线

当前本地 `main` 尚未包含已经完成的模型升级，而另一个工作分支存在提交 `e491115` 和后续 OCR 拆分提交 `4dbe552`：

- 文本模型默认值：`qwen3.7-flash`
- 视觉模型默认值：`qwen3-vl-plus`
- OCR 模型默认值：`qwen-vl-ocr-latest`
- 环境变量：`AI_TEXT_MODEL`、`AI_VISION_MODEL`、`AI_OCR_MODEL`

正式创建架构改造分支前必须按顺序完成：

1. 确认线上正在运行的 commit、PM2 配置和环境变量，不以本地 `main` 猜测线上状态。
2. 备份线上应用目录、Nginx 配置和环境变量清单；密钥值不得写入备份说明或 Git。
3. 将 `e491115`、`4dbe552` 合并或 cherry-pick 到正式改造基线，解决“线上已切模型、主分支未包含”的漂移。
4. 将云端实际代码与本地仓库做只读差异核对，尤其检查是否存在本地没有的 cron、job 或临时修复。
5. 冻结一份接口契约测试，之后每个迁移步骤都必须通过。

未完成以上对齐，不允许直接用当前本地 `main` 覆盖生产服务器。

## 4. 不可破坏的外部 API 契约

### 4.1 兼容原则

- 现有路径、HTTP 方法、认证头、上传字段和成功响应外壳必须保持。
- 现有 iOS 仍使用 `Authorization: Bearer <JWT>`；手机号登录和 Apple 登录签发完全相同的应用 JWT。
- 新实现可以增加字段，但不得删除或改名 iOS 正在解码的字段。
- 错误响应统一为 `{ success: false, message, code?, requestId? }`；上线前不强制 iOS 依赖新增字段。
- 内部 controller/service 可重写，Nginx 不得重写掉 `/api`。

### 4.2 路由冻结清单

| 领域 | 必须保留的接口 | 说明 |
| --- | --- | --- |
| 用户 | `POST /api/users/register`、`POST /api/users/login` | 手机号注册和登录行为保持 |
| Apple | `POST /api/users/apple` | 新增；一次接口同时完成 Apple 注册或登录 |
| 用户资料 | `GET /api/users/me`、`PATCH /api/users/update-username`、`PATCH /api/users/update-gender`、`PATCH /api/users/update-age`、`GET /api/users/stats` | 保持现有响应结构 |
| 会话与账号 | `POST /api/users/logout`、`POST /api/users/password-reset/request`、`POST /api/users/password-reset/confirm`、`DELETE /api/users/delete-account` | 后三项是 iOS 已调用但当前后端需补齐的契约 |
| 方案 | `POST /api/plans`、`GET /api/plans`、`GET /api/plans/:id`、`PATCH /api/plans/:id/step`、`POST /api/plans/custom`、`DELETE /api/plans/:id` | 不在本轮改名 |
| 产品 | `POST /api/products`、`POST /api/products/:id/upload-image`、`POST /api/products/:id/extract-ingredients`、`GET /api/products`、`GET /api/products/:id`、`GET /api/products/user/:userId`、`GET /api/products/user/:userId/label/:label`、`PUT /api/products/:id`、`DELETE /api/products/:id` | URL 中的 `userId` 不再作为授权依据 |
| 成分 | `POST /api/products/:id/analyze-ingredients`、`GET /api/products/:id/ingredient-analysis` | 复用产品归属校验 |
| 冲突 | `POST /api/conflicts`、`GET /api/conflicts`、`GET /api/conflicts/:id`、`DELETE /api/conflicts/:id` | 所有读写按当前用户过滤 |
| 皮肤分析 | `POST /api/skin-analysis/analyze`、`GET /api/skin-analysis`、`GET /api/skin-analysis/:id`、`GET /api/skin-analysis/latest`、`GET /api/skin-analysis/stats`、`DELETE /api/skin-analysis/:id` | multipart 字段必须继续叫 `faceImage` |
| 探活 | `GET /health`、`GET /ready` | 新增，不放在 `/api` 下 |

## 5. 双登录体系设计

### 5.1 对外保持两套入口，对内统一为一个用户和一种会话

```text
手机号 + 密码 ─┐
               ├─> AuthService ─> 本地 User ─> 应用 JWT ─> 现有 protect 中间件
Sign in with Apple ─┘
```

手机号用户继续通过 `/users/register` 和 `/users/login`。Apple 用户通过 `/users/apple`，后端以 Apple 验证后的 `sub` 查找或创建本地用户。二者最终都返回现有格式：

```json
{
  "success": true,
  "message": "登录成功",
  "token": "<application-jwt>",
  "data": { "user": {} }
}
```

Apple 的 `identityToken` 只用于换取本应用会话，绝不能作为后续业务接口的 Bearer Token。

当前 iOS 源码中还保留了 email 版 register/login overload 和可选 `email` DTO，但当前后端没有对应 email 认证实现，且本次产品要求明确为“两套”：手机号/密码与 Apple。首发不得把 email 悄悄扩成第三套登录方式；只保留可选字段的解码兼容。若未来正式启用邮箱认证，必须作为独立 provider 设计、验证邮箱归属并补充契约测试。

### 5.2 用户模型的最小兼容改造

上线阶段不引入复杂身份表，先在现有 `User` 上做可迁移字段：

```js
{
  phone: String,                 // optional, unique + sparse，入库前规范化
  password: String,              // optional；仅 phone provider 需要，select: false
  appleSubject: String,          // optional, unique + sparse；Apple 认证的稳定主键
  appleRefreshTokenCiphertext: String, // optional, select: false；用于删号撤销
  authProviders: ['phone', 'apple'],
  name: String,                  // API 中始终非空；Apple 缺失姓名时生成中性展示名
  gender: String,                // optional；作为资料完整度处理，不是认证前置条件
  age: Number,
  profileStatus: 'incomplete' | 'complete',
  accountStatus: 'active' | 'disabled' | 'deleting',
  tokenVersion: Number
}
```

强制约束：

- 用户必须至少拥有 `phone + password` 或 `appleSubject` 之一。
- `phone` 和 `appleSubject` 都使用 sparse unique index；迁移前必须检查重复值。
- 仅当 `password` 新增或变更时执行 bcrypt hash。Apple-only 用户不得被迫生成假密码。
- `name` 在数据库和 API DTO 中保持非空，以兼容当前 iOS 的非可选 `String`；Apple 首登未取得姓名时生成中性展示名并将 `profileStatus` 标记为 `incomplete`。`gender` 可调整为资料完整度字段；手机号注册接口仍按原契约要求姓名和性别，避免改变当前体验。
- `appleSubject` 是 Apple 身份唯一键；不得以 email 自动查找、自动绑定或自动合并用户。
- `appleRefreshTokenCiphertext` 必须使用独立密钥加密，密钥只存在于 secrets/environment，不写日志、不返回客户端。

当用户规模和第三方身份种类增长后，再无损迁移到独立 `AuthIdentity` 集合；不是首发阻塞项。

### 5.3 `POST /api/users/apple`

请求体：

```json
{
  "identityToken": "<apple-jwt>",
  "authorizationCode": "<one-time-code>",
  "rawNonce": "<client-generated-random-value>",
  "givenName": "optional-first-login-only",
  "familyName": "optional-first-login-only"
}
```

服务端必须：

1. 从 Apple JWKS 按 `kid` 选择公钥并缓存，验证算法和签名。
2. 校验 `iss`、`aud`、`exp`、`sub`，其中 `aud` 必须等于 Bundle ID `personal.AIskin`。
3. 校验 token 中的 nonce 与 `SHA-256(rawNonce)` 一致，防止重放。
4. 使用一次性 `authorizationCode` 在服务端完成 token exchange；需要支持删号撤销时，加密保存 refresh token。
5. 仅使用验证后的 `sub` 查找用户。首次登录用事务或唯一索引抵御并发重复创建。
6. Apple 通常只在首次授权返回姓名；只在本地姓名为空或仍是系统占位名时保存，不用客户端姓名覆盖用户已编辑的资料。若创建用户时没有姓名，后端生成非敏感的中性展示名，保证当前 iOS `User.name: String` 可解码。
7. 签发与手机号登录相同的应用 JWT，并返回相同 user DTO。

任何签名、issuer、audience、过期时间、nonce 或 code exchange 失败都必须返回认证失败，不能降级成“先登录再说”。

### 5.4 同一用户的账号绑定与冲突处理

首发允许两套登录同时存在，但不按 email 猜测它们是否属于同一人：

- 已登录手机号用户可在后续阶段调用受保护的 `POST /api/users/apple/link`，后端完成同样的 Apple 全量验证后，把 `appleSubject` 绑定到当前用户。
- 如果该 `appleSubject` 已属于其他 User，返回明确冲突，不静默合并数据。
- Apple-only 用户若要绑定手机号，必须先完成手机号验证码验证，再设置密码；不能只凭客户端传入手机号绑定。
- 在绑定 UI 上线前，两种入口可能产生两个独立账号，这是可接受但必须在产品文案中透明说明的首发限制。

### 5.5 登出、重置密码和删除账号

- `logout` 保持当前接口；若 JWT 是无状态的，至少由客户端删除 token。上线后可通过 `tokenVersion` 支持全端失效。
- 密码重置只适用于有 `phone` provider 的用户，并需要真实短信验证码、频控、过期时间和尝试次数限制。
- `delete-account` 必须按状态机处理：标记 `deleting`，删除/匿名化业务数据，删除私有图片，若存在 Apple refresh token 则调用 Apple revoke，最后禁用账号并使 JWT 失效。
- 删除过程部分失败时必须可重试，不能先返回永久成功再留下人脸图片和可用 token。

Apple 服务端验证依据应以官方文档为准：[Verifying a user](https://developer.apple.com/documentation/signinwithapple/verifying-a-user)、[Handling account deletions and revoking tokens](https://developer.apple.com/documentation/technotes/tn3194-handling-account-deletions-and-revoking-tokens-for-sign-in-with-apple)。

## 6. 目标代码结构

```text
backend/
  server.js                         # 过渡期兼容入口，只 require src/index.js
  src/
    app.js                          # 创建 Express app、挂中间件/路由/错误处理
    index.js                        # 校验配置、连 DB、listen、信号处理
    config/
      config.js                     # 环境变量校验后的只读配置
      logger.js
    routes/
      index.js
      user.route.js
      plan.route.js
      product.route.js
      conflict.route.js
      skinAnalysis.route.js
    controllers/                    # 只做 HTTP 输入/输出
    services/                       # 业务用例和事务边界
      auth.service.js
      user.service.js
      plan.service.js
      product.service.js
      conflict.service.js
      skinAnalysis.service.js
    validations/                    # params/query/body schema
    models/                         # Mongoose schema/index；不放 HTTP 逻辑
    middlewares/
      auth.js
      validate.js
      error.js
      requestId.js
      rateLimit.js
    providers/
      ai/
        modelRegistry.js
        dashscopeClient.js
        outputParser.js
      apple/
        appleTokenVerifier.js
        appleOAuthClient.js
      storage/
        objectStorage.js
    prompts/
      plan.prompt.js
      conflict.prompt.js
      ingredient.prompt.js
      skinAnalysis.prompt.js
    jobs/                            # 上线后再放长任务/补偿任务
    utils/
  tests/
    unit/
    integration/
    contract/
    eval/
  deploy/
    nginx/
      aiskin.conf
  Nginx.md
```

首发不增加 repository 层。所选参考项目本身采用 service 直接调用 Mongoose model，这对当前规模更轻。只有在查询逻辑跨多个 service 重复、需要替换存储或事务边界明显复杂时再引入 repository。

### 6.1 分层硬规则

| 层 | 可以做 | 不可以做 |
| --- | --- | --- |
| route | 路由、认证、校验中间件编排 | 写业务、访问 DB、调用 AI |
| controller | 读取已校验输入、调用一个 service、映射 HTTP 响应 | 拼 prompt、直接操作 OSS/Mongoose |
| service | 业务规则、事务、权限、provider 编排 | 依赖 Express 的 `req/res` |
| provider | 封装 Apple、DashScope、OSS 等外部协议 | 决定用户业务流程 |
| model | schema、index、轻量实体方法 | 调外部 API、返回 HTTP |
| middleware | 跨领域 HTTP 能力 | 承担具体业务流程 |

## 7. AI 模型与 Provider 设计

### 7.1 上线模型基线

- 文本任务：`qwen3.7-flash`
- 视觉任务：`qwen3-vl-plus`
- OCR 任务：`qwen-vl-ocr-latest`
- plan、conflict、ingredient-analysis 使用文本模型。
- skin-analysis 使用视觉模型，OCR 使用独立 OCR 模型。

模型名只允许来自已校验的配置：

```env
AI_TEXT_MODEL=qwen3.7-flash
AI_VISION_MODEL=qwen3-vl-plus
AI_OCR_MODEL=qwen-vl-ocr-latest
```

业务 controller 和 prompt 文件不得硬编码模型名。模型切换只修改部署配置或 `modelRegistry` 的受控映射，并经过回归测试后发布。

### 7.2 统一调用契约

`dashscopeClient` 统一负责：

- base URL、鉴权、连接和读取超时。
- request ID、耗时、provider、model、promptVersion、token usage 等非敏感可观测字段。
- 统一异常：超时、限流、上游 4xx/5xx、空响应、JSON 解析失败、schema 不合格。
- 有边界的重试：只对明确可重试的网络错误/429/部分 5xx 重试，带指数退避和总时限。

每个任务必须有独立 prompt、输出 schema 和版本号。输出无法通过 schema 校验时返回明确失败或进入重试，严禁填充“健康分 70”等伪造默认结果并返回成功。

### 7.3 切换和降级规则

- 首发不做未经评测的自动跨模型、跨 provider fallback；不可控的结果漂移比显式失败更危险。
- 每次模型变更必须跑固定匿名样本的 golden eval，检查 JSON 合法率、字段完整率、医学措辞边界、延迟和成本。
- 生产可通过环境变量小流量 canary；失败立即回到上一组已验证模型值，无需修改 iOS。
- 数据记录保存 `provider/model/promptVersion/schemaVersion/latency/status`，不得记录 Authorization、完整人脸 URL、原始 Apple token 或包含隐私的原始 prompt。

## 8. 数据、安全与存储规则

### 8.1 资源归属

所有用户资源查询都必须同时包含资源 ID 和当前 JWT 用户 ID，例如：

```js
Product.findOne({ _id: productId, user: req.user._id })
```

URL 中的 `:userId` 仅可作为兼容参数，授权依据永远是已验证的 `req.user._id`。跨用户后台能力必须是单独的管理员接口和权限体系，不能复用普通用户路由。

### 8.2 人脸图片

- 人脸原图必须进入私有 bucket，不得使用 `public-read`，不得通过 Nginx `/uploads` 目录公开。
- AI provider 如需访问图片，使用短时签名 URL 或受控字节流；签名 URL 不进日志。
- 删除皮肤分析记录时同步删除对象存储文件；失败进入可重试补偿任务。
- 明确保存期限；没有业务需要时尽早删除原图，仅保留必要的结构化结果。

产品包装图可按产品需求单独决定公开性，但必须与人脸图片使用不同前缀、bucket policy 或独立 bucket，不能共享“全部 public-read”策略。

### 8.3 配置与日志

- `JWT_SECRET`、Mongo URI、DashScope key、OSS secret、Apple client secret/private key、refresh-token encryption key 必须在生产 secrets 中提供；缺失时启动失败。
- 禁止默认 JWT secret，禁止把 `.env`、密钥、token、手机号、人脸 URL、原始 AI 输出写入 Git 或普通日志。
- 每个请求带 `requestId`，错误日志使用结构化字段；客户端只得到稳定错误码和安全消息。

## 9. 启动、错误和健康检查

### 9.1 启动顺序

1. 校验全部环境变量和合法枚举。
2. 初始化 logger/provider 配置。
3. 连接 MongoDB，并确认必要索引/迁移状态。
4. 创建 HTTP server 并开始监听 `127.0.0.1:5000`。
5. 收到 `SIGTERM/SIGINT` 时停止接收新请求，等待在途请求，再关闭 MongoDB 和 server。

数据库或关键配置失败时进程必须非零退出，由 PM2/systemd 判断失败；不能打印错误后继续提供半可用服务。

### 9.2 探活

- `GET /health`：仅表示 Node 进程和事件循环可响应，不访问外部服务。
- `GET /ready`：检查配置已加载、MongoDB 可用和应用已完成初始化；不在每次探测时真实调用大模型或 Apple。
- 两者不得暴露版本密钥、数据库地址或堆栈。

### 9.3 错误处理

所有错误进入一个中央 error handler。业务使用带 `statusCode/code/isOperational` 的错误类，controller 不再重复 `try/catch + res.status`。生产环境隐藏 stack 和上游原始错误，日志通过 `requestId` 对应排查。

## 10. 渐进实施顺序

### Phase 0：冻结与对齐（必须先做）

- 确认主分支和线上 commit，合入 `e491115`、`4dbe552` 模型升级。
- 对比云端真实代码和本地仓库，列出漂移。
- 从 iOS 代码生成现有契约清单和成功响应快照。
- 建立数据库/对象存储/Nginx 备份与回滚点。

完成标准：知道“什么在线上运行”，contract tests 可在测试环境重复执行。

### Phase 1：先补 P0 上线缺口

- 修复产品、冲突、皮肤分析等资源归属校验。
- 补齐 iOS 已使用但后端缺失的 password reset、delete account、plan step/custom 路由。
- 人脸图片改私有，删除记录时删除对象。
- 删除敏感日志和伪造 AI 默认结果。
- JWT secret 等关键配置改为缺失即启动失败。

完成标准：无已知越权读取路径；删号/删分析能清理数据；现有 iOS smoke test 通过。

### Phase 2：搭新骨架但不改业务结果

- 新建 `src/app.js`、`src/index.js`、config、requestId、validate、error、health/ready。
- 保留根 `server.js` 作为兼容启动 shim，package script 暂不突变。
- 建立 contract/integration 测试框架。

完成标准：新旧入口响应一致，数据库失败不监听，PM2 可优雅 reload。

### Phase 3：先迁认证，再按领域迁移

1. user/auth：先保持手机号接口，再上线 Apple `/users/apple`。
2. product + ingredient：统一资源归属和存储 provider。
3. conflict。
4. skin-analysis：私有图片和视觉 provider。
5. plan + idea/feedback。

每次只迁一个领域；旧 controller 在该领域 contract tests 全通过后才删除。

### Phase 4：统一外部 Provider

- 合入并固化模型 registry，迁移全部 AI 调用和输出 schema。
- 封装 Apple verifier/OAuth client。
- 封装私有/公开对象存储策略。
- 加 provider mock、超时、重试和可观测性测试。

### Phase 5：Nginx 与轻量发布

- 按 `Nginx.md` 生成实际站点配置。
- 先测试环境 smoke，再生产 `nginx -t` 和 PM2 reload。
- 观察错误率、AI 合法输出率、p95 延迟、Mongo 连接和 401/403 比例。

### Phase 6：上线后再异步化

只有当同步 AI 请求的超时率或并发成为真实瓶颈时，才引入队列和任务状态：

```text
queued -> processing -> succeeded | failed | cancelled
```

届时可新增异步接口版本，但现有同步接口继续保持或经过明确的 iOS 发版迁移，不在服务端暗改语义。

## 11. 测试与验收门槛

### 11.1 必须有的测试

- 单元：配置校验、JWT、Apple claims/nonce、User 条件校验、AI output schema、资源归属。
- 集成：手机号注册/登录、Apple 首登/复登/非法 token、用户资料、产品、成分、冲突、皮肤分析、方案、删除账号。
- 契约：冻结路径、方法、multipart 字段、状态码和 iOS 依赖的 JSON 字段。
- 安全：跨用户 ID 返回 404/403、过期 JWT、错误 audience、重放 nonce、上传类型/尺寸、限流。
- AI eval：固定匿名样本对文本和视觉模型分别评分；不依赖实时生产用户数据。

外部 Apple、DashScope、OSS 在常规 CI 使用 mock；另设受控的 staging smoke 验证真实凭据，不能让普通 Jest 测试直接消耗生产服务。

### 11.2 上线验收

- 当前 iOS 不改 base URL 即可完成原有手机号完整流程。
- Apple 原生按钮可完成首次注册、再次登录，并拿到同结构应用 JWT。
- 非法/过期/错误 audience/nonce 的 Apple token 全部拒绝。
- 所有用户资源无法通过替换 ID 跨账号读取或删除。
- 模型实际记录为 `qwen3.7-flash` / `qwen3-vl-plus`，输出 schema 合法；解析失败不伪造成功。
- 人脸对象不可匿名公网访问，删除分析和删除账号后对象被清理。
- `/health`、`/ready`、Nginx TLS、上传、超时和请求 ID 正常。
- 部署前后的 contract/integration tests 通过，并完成真实设备 smoke。

## 12. 回滚策略

- 代码：每个 Phase 独立提交和部署，保留上一稳定 commit 与 PM2 release 目录。
- 配置：Nginx 和环境变量每次变更前生成带时间戳备份；回滚不依赖重新手写。
- 模型：恢复上一组 `AI_TEXT_MODEL/AI_VISION_MODEL` 后 reload，iOS 无需发版。
- 数据库：先做向后兼容的 additive migration；首发只新增可选字段和索引，不立即删除旧字段。确认两个版本都可读后再清理。
- Apple：若 Apple 登录故障，可临时关闭 Apple 入口 feature flag，但手机号登录必须保持可用。
- 存储：迁移私有 bucket 前保留可追踪对象映射；不得以回滚为由重新公开人脸对象。

## 13. 实施中的关键决策记录

| 决策 | 结论 |
| --- | --- |
| 底层参考项目 | 只选 `hagopj13/node-express-boilerplate` |
| 运行形态 | 模块化单体，一个 Node 服务 |
| 外部接口 | 保持 `/api` 和现有响应外壳 |
| 登录方式 | 手机号/密码 + Sign in with Apple 并存 |
| 邮箱登录 | 非本次首发认证方式，仅保留现有可选 DTO 兼容 |
| 会话 | 两种登录统一签发应用 JWT |
| Apple 用户主键 | 已验证的 `sub`，禁止按 email 自动合并 |
| 文本模型 | `qwen3.7-flash` |
| 视觉模型 | `qwen3-vl-plus` |
| OCR 模型 | `qwen-vl-ocr-latest` |
| AI 失败 | 明确失败/受控重试，不生成伪造默认值 |
| 人脸图片 | 私有存储、短时授权、可删除 |
| 首发队列 | 不引入；有真实瓶颈后再加 |
| repository 层 | 首发不加，保持轻量 |
