# AI Skin 后端接口专项测试报告

测试日期：2026-08-26  
测试分支：`codex/backend-architecture-refactor`  
测试范围：仅后端 API，不运行 iOS 单元测试、UI 测试或自动交互。

## 最终结果

```text
npm test
Test Suites: 12 passed, 1 skipped
Tests:       57 passed, 1 skipped

npm run test:e2e:real
Test Suites: 1 passed, 1 total
Tests:       1 passed, 1 total
关键 HTTP 检查点：32/32 passed
最终修复后连续完整通过：2 次

npm audit
found 0 vulnerabilities
```

同时通过：

- `npm run check`
- `node --check` 全部 `src/` 和 `tests/` JavaScript 文件
- `git diff --check`
- 测试结束后无遗留 Jest、MongoDB Memory Server 或后端 Node 进程

## 测试方式

测试不是只调用 service 函数。关键链路会启动真实 Node HTTP listener，并通过 `127.0.0.1` 的随机空闲端口发送 HTTP、JSON 和 multipart 请求，再进入 Express middleware、route、controller、service 和 Mongoose。

真实参与测试的组件：

- Express 路由、中间件、Joi 校验、统一错误处理
- JWT 签发、鉴权、吊销和 bcrypt 密码校验
- Multer multipart 上传、大小限制和真实文件签名校验
- Mongoose model、查询、写入、用户隔离和删除
- MongoDB Memory Server
- `/health`、`/ready`、HTTP 启停和数据库生命周期

常规 `npm test` 使用协议级测试替身的外部依赖：

- DashScope/Qwen
- Aliyun OSS
- Apple identity/JWKS/token exchange/revoke
- 短信网关

另外使用 `npm run test:e2e:real` 启动本地随机端口和内存 MongoDB，并真实连接阿里 OSS 与 DashScope。该测试没有替换 `aiProvider` 或 `storageProvider`，真实执行产品图上传、两次 OCR、成分分析、冲突分析、方案生成、面部图上传、肌肤分析、签名 URL 和对象删除。测试凭据仅临时注入进程，没有写入仓库。

仍使用协议级测试的外部能力：Apple 成功登录/绑定/revoke、短信验证码发送。真实 Apple 成功登录需要用户产生的一次性 `identityToken` 和 `authorizationCode`；本地真实 HTTP E2E 已验证无效 Apple 凭证会被拒绝。

## 前端接口契约覆盖

以下路径来自当前 iOS `Services/*ApiService.swift`，并使用后端集成测试逐项验证。

### 用户与认证

| Method | Path | 验证内容 | 结果 |
|---|---|---|---|
| POST | `/api/users/register` | 手机号注册、密码哈希、JWT、重复手机号、非法手机号 | PASS |
| POST | `/api/users/login` | 正确密码、错误密码、重置前后密码 | PASS |
| GET | `/api/users/me` | 当前用户、无 token、登出后旧 token | PASS |
| PATCH | `/api/users/update-username` | 更新并返回 DTO | PASS |
| PATCH | `/api/users/update-gender` | 更新并返回 DTO | PASS |
| PATCH | `/api/users/update-age` | 更新并返回 DTO | PASS |
| GET | `/api/users/stats` | 用户统计响应 | PASS |
| POST | `/api/users/logout` | tokenVersion 吊销旧 JWT | PASS |
| POST | `/api/users/password-reset/request` | 中性响应、短信发送失败不泄露账号存在性 | PASS |
| POST | `/api/users/password-reset/confirm` | 验证码、密码更新、旧密码失效 | PASS |
| DELETE | `/api/users/delete-account` | 用户、业务数据、私有对象删除 | PASS |
| POST | `/api/users/apple` | Apple 首登、复登、无重复用户、错误 token | PASS with mock |
| POST | `/api/users/apple/link` | 已登录手机号用户绑定 Apple | PASS with mock |

额外验证了 `/api/users/update-menstrual-cycle`。

### 产品、OCR 与成分分析

| Method | Path | 验证内容 | 结果 |
|---|---|---|---|
| POST | `/api/products` | 创建产品 | PASS |
| GET | `/api/products` | 分页列表 | PASS |
| GET | `/api/products/:id` | 产品详情、私有图片签名刷新、跨用户隔离 | PASS |
| PUT | `/api/products/:id` | 更新产品 | PASS |
| DELETE | `/api/products/:id` | 删除产品和对象 | PASS |
| GET | `/api/products/user/:userId` | iOS 兼容路径，实际按 JWT 用户过滤 | PASS |
| GET | `/api/products/user/:userId/label/:label` | 标签过滤 | PASS |
| POST | `/api/products/:id/upload-image` | multipart 字段 `productImage`、合法图片、伪造图片 | PASS |
| POST | `/api/products/:id/extract-ingredients` | `qwen-vl-ocr-latest` 真实 OCR 结果写入产品 | PASS real |
| POST | `/api/products/:id/analyze-ingredients` | `qwen3.7-flash` 真实成分安全、功效和风险分析 | PASS real |
| GET | `/api/products/:id/ingredient-analysis` | 成分分析详情 DTO | PASS |

### 冲突检测

| Method | Path | 验证内容 | 结果 |
|---|---|---|---|
| POST | `/api/conflicts` | 两个已提取成分产品的完整真实冲突分析 | PASS real |
| GET | `/api/conflicts` | 当前用户冲突记录列表 | PASS |
| GET | `/api/conflicts/:id` | 当前 iOS 使用的详情路径 | PASS |
| DELETE | `/api/conflicts/:id` | 删除冲突记录 | PASS |
| GET | `/api/conflicts/detail/:id` | 历史兼容详情路径 | PASS |
| GET | `/api/conflicts/user/:userId` | 历史摘要路径、JWT 用户隔离 | PASS |

同时验证少于两个产品、缺少成分和跨用户读取会被拒绝。

### 护肤方案

| Method | Path | 验证内容 | 结果 |
|---|---|---|---|
| POST | `/api/plans` | 基于用户、产品、肌肤信息真实生成方案 | PASS real |
| GET | `/api/plans` | 当前用户方案列表 | PASS |
| GET | `/api/plans/:id` | 方案详情和跨用户隔离 | PASS |
| PATCH | `/api/plans/:id/step` | 早晚步骤完成状态 | PASS |
| POST | `/api/plans/custom` | 不调用 AI 的自定义方案 | PASS |
| DELETE | `/api/plans/:id` | 删除方案 | PASS |

同时验证没有产品时不能生成 AI 方案。

### 肌肤检测

| Method | Path | 验证内容 | 结果 |
|---|---|---|---|
| POST | `/api/skin-analysis/analyze` | multipart 字段 `faceImage`、真实私有上传、真实 AI 结果持久化 | PASS real |
| GET | `/api/skin-analysis` | 历史、分页、短时图片 URL | PASS |
| GET | `/api/skin-analysis/latest` | 最新检测 | PASS |
| GET | `/api/skin-analysis/stats` | 次数、平均健康分、最新状态 | PASS |
| GET | `/api/skin-analysis/:id` | 详情和跨用户隔离 | PASS |
| DELETE | `/api/skin-analysis/:id` | 数据记录和私有图片对象删除 | PASS |

同时验证伪造图片会返回 `INVALID_IMAGE`，不会创建检测记录。

### 反馈和运行状态

| 范围 | 验证内容 | 结果 |
|---|---|---|
| `/api/ideas`、`/api/ideas/:id` | 创建、列表、详情、更新、删除、用户隔离 | PASS |
| `/health` | 进程健康 | PASS |
| `/ready` | MongoDB 就绪状态 | PASS |
| 未知路由 | 安全 404 响应 | PASS |

## 已识别的前端遗留契约

`UserApiService.swift` 仍保留 `register(name:email:password:)` 和 `login(email:password:)` 两个 email 重载，但当前登录和注册页面调用的是手机号版本。根据当前产品决策，首发只支持：

1. 手机号 + 密码
2. Sign in with Apple

因此 email-only 请求会被后端校验拒绝，本报告不将这两个未使用的遗留函数标为通过。若未来需要邮箱登录，应作为第三种认证 provider 单独设计；若确定永不支持，应在后续 iOS 清理任务中删除这些遗留协议函数。

## 本次真实测试发现并修复

1. OCR 将成分返回为对象数组，增加无损归一化。
2. 化学名 `1,3-丙二醇` 曾被英文逗号误拆，改为只按中文列表分隔符拆分。
3. 成分分析的英文风险枚举、字符串/数组和单元素顶层数组波动。
4. 冲突分析的英文等级、字符串步骤和字符串产品搭配波动。
5. 方案摘要对象和单元素顶层数组波动。
6. 肌肤检测的同义枚举、空字符串分布、数字 `0`、字符串/数组 `otherIssues` 波动。
7. 为非法 AI 输出增加只记录 Schema 路径/类型的结构化诊断，不记录图片、Prompt 或完整输出。

## 仍需外部凭证完成的验收

1. Apple 真机首登、复登、绑定和账号删除 revoke。
2. 真实短信验证码发送、频率限制和到达率。
3. 上线前继续使用更多不同包装和不同面部样本做模型效果评估；本次证明的是功能链路与响应契约，不等同于医学或业务效果准确率评测。
