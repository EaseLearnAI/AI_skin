# AI Skin 后端协作规则

## 适用范围与首要目标

- 本文件适用于 `backend/**`。后续修改后端时必须先阅读本文件。
- 当前第一优先级是保证 iOS 前端已经调用的接口持续可用；不以补齐云端历史接口作为本阶段验收条件。
- 前端契约的事实来源是 `ios_aiskin/AIskin/Services/*ApiService.swift`、`Core/Networking/*` 和实际页面调用，不凭旧文档猜测。
- 当前采用 Express + Mongoose 模块化单体。未获得明确要求时，不迁移 TypeScript、不拆微服务、不更换数据库。

## 固定分层

请求链路必须保持：

`server.js -> src/index.js -> app -> route -> controller -> service -> model/provider`

- `server.js`：只加载环境变量并启动运行时，保留 PM2 的稳定入口。
- `src/index.js`：组装依赖、连接 MongoDB、监听 HTTP、优雅退出；不得写业务逻辑。
- `src/app.js`：只挂载通用中间件、健康检查、路由和错误处理。
- `routes/`：声明 URL、HTTP method、鉴权、上传字段和 Joi 校验；不得访问数据库或外部服务。
- `controllers/`：只做 HTTP 参数/响应转换并调用 service；不得直接调用 AI、OSS 或 Mongoose。
- `services/`：承载业务流程、权限和事务边界；通过 provider 使用外部能力。
- `models/`：只定义持久化 schema、索引和模型行为，保持现有 collection 名称兼容。
- `providers/`：统一封装 DashScope、OSS、Apple、短信；业务模块不得重复创建 SDK client。
- `prompts/`：集中维护 Prompt；修改 Prompt 时同步维护输出 schema、归一化逻辑和测试。

## 必须复用的公共组件

- 运行时：`createRuntime`、`createApp`、`createApiRouter`，测试不得通过 `require` 意外监听端口。
- 中间件：`createProtect`、`validate`、`createImageUpload`、`errorHandler`、`requestId`、`createAccessLog`。
- 外部能力：`dashscopeProvider`、`objectStorageProvider`、`appleTokenVerifier`、`appleOAuthClient`、`passwordResetSender`。
- 业务能力：现有 `auth/product/conflict/plan/skinAnalysis/idea/accountDeletion` service；先扩展已有 service，再考虑新建重复模块。
- 前端网络基础设施已经统一为 `APIClient -> HTTPClient -> URLSessionHTTPClient`，后端不得要求每个页面自行拼 URL、Token 或 multipart。

## 当前 iOS 前端接口基线

前端生产 Base URL 是 `https://www.lunzo.site/api`，Debug Base URL 是 `http://127.0.0.1:5001/api`。截至 2026-09-10，从当前 Swift Service 静态提取并归一化共有 44 个唯一的 method/path 契约；其中 `/users/...` 等路径在后端对应 `/api/users/...`。逐项来源见 [当前 iOS 接口契约](backend/doc/api-contract-20260910.md)，数量变化时应重新从源码核对。

### 用户与认证

- `POST /api/users/register`：当前页面发送 `name/phone/password/gender`。
- `POST /api/users/login`：当前页面发送 `phone/password`。
- `POST /api/users/apple`：当前 Swift 发送 `identityToken/authorizationCode/rawNonce` 及可选姓名，统一处理 Apple 注册与登录。
- `POST /api/users/password-reset/request`：发送 `phone`。
- `POST /api/users/password-reset/confirm`：发送 `phone/verificationCode/newPassword`。
- `GET /api/users/me`。
- `PATCH /api/users/update-username`：发送 `name`。
- `PATCH /api/users/update-gender`：发送 `gender`。
- `PATCH /api/users/update-age`：发送 `age`。
- `GET /api/users/stats`。
- `POST /api/users/logout`。
- `DELETE /api/users/delete-account`。

### 产品、OCR 与成分分析

- `POST|GET /api/products`。
- `GET|PUT|DELETE /api/products/:id`。
- `GET /api/products/user/:userId`。
- `GET /api/products/user/:userId/label/:label`。
- `POST /api/products/:id/upload-image`，multipart 字段固定为 `productImage`。
- `POST /api/products/:id/extract-ingredients`。
- `POST /api/products/:id/analyze-ingredients`。
- `GET /api/products/:id/ingredient-analysis`。

### 冲突、方案与肌肤检测

- 冲突：`POST|GET /api/conflicts`、`GET|DELETE /api/conflicts/:id`。
- 方案：`POST|GET /api/plans`、`GET|DELETE /api/plans/:id`、`PATCH /api/plans/:id/step`、`POST /api/plans/custom`。
- 当前方案：`GET|PUT /api/plans/active`；每日步骤：`GET /api/plans/:id/daily`、`PUT /api/plans/:id/daily/steps`。
- 肌肤检测：`POST /api/skin-analysis/analyze`，multipart 字段固定为 `faceImage`。
- 肌肤记录：`GET /api/skin-analysis`、`GET /api/skin-analysis/latest`、`GET /api/skin-analysis/stats`、`GET|DELETE /api/skin-analysis/:id`。
- 检测备注：`PATCH /api/skin-analysis/:id/context`。

### 当前不属于前端上线阻塞的接口

- 当前 Swift 页面没有调用 `/api/checkin-plans`、`/api/square`、`/api/ideas`。
- 当前 Swift 已调用 `/api/users/apple`；`/api/users/apple/link` 是已实现且有集成测试的预留绑定能力，不能因当前页面没有调用而删除。
- `UserApiService` 的 email 注册/登录重载是遗留兼容代码，当前页面实际使用手机号；未明确恢复邮箱登录前，不扩大首发认证范围。
- 上述非阻塞能力可以后续逐项补充，但不得因此破坏当前接口基线。

## 接口兼容规则

- 未同时修改前端并更新契约测试时，不得更改已有 path、method、multipart 字段、请求字段或成功响应结构。
- 响应继续使用前端可解码的 `success/message/data/error` 包络；错误响应必须保留可读的 `message` 或 `error`。
- 受保护接口统一使用 `Authorization: Bearer <token>`；URL 中的 `userId` 仅作历史兼容，数据权限必须来自 JWT 用户。
- 日期使用 ISO 8601；分页字段、`_id/id` 映射和可选字段必须继续兼容现有 Swift `Codable` 模型。
- AI 返回必须先做无损归一化再做 schema 校验。不得用伪造默认结果掩盖模型、网络或解析失败。
- 人脸图保持私有；OSS 上传、签名 URL、删除都通过 storage provider，删除业务记录时同步清理对应对象。

## 修改流程

1. 先从 iOS Service 和页面调用确认受影响接口、字段与响应模型。
2. 先补或更新 contract/integration 测试，锁定当前前端行为。
3. 按既定分层修改；优先复用 middleware、service、provider 和 model。
4. 运行 `npm run check`、`npm test`；只改一个模块时也可先运行对应 unit/contract/integration 测试。
5. 修改 AI、OCR、OSS 或完整业务链路时，在获得真实凭据授权后运行 `npm run test:e2e:real`；不得把 mock 结果描述成真实外部链路通过。
6. 报告必须分开写明：代码检查、替身测试、真实 HTTP、真实 MongoDB、真实 AI/OSS、未验证项。

## 启动与发布底线

- 启动前先清理残留端口和幽灵进程，避免多实例污染。
- 部署前核对服务器 Node 版本满足 `package-lock.json` 中依赖的 engines；依赖安装使用 `npm ci`。
- 生产环境变量只检查是否存在，不打印密钥；不得把 `.env`、Token、图片或完整 AI 输出提交到仓库或日志。
- 发布先在备用端口验证 `/health`、`/ready` 和前端核心 smoke，再切换 PM2/Nginx；保留上一版本回滚目录。
- 未经用户明确授权，不修改云服务器、数据库、OSS 对象、PM2 或 Nginx。

## Git 与交付流程

- 提交前先向用户确认目标主分支，并重新拉取远端最新状态；保留和避让用户已有的未提交改动。
- 只在自己的功能分支提交和推送，不把未经确认的重构直接写入主分支。
- 创建 PR/MR 时标题使用简洁英文祈使句，描述使用中文，完整写明背景、改动、接口影响、测试证据和未验证项。
- “本地已通过”“已推送”“已合并”“已部署”“生产已验证”是五种不同状态，报告中不得混写。
