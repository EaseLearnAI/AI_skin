# AI Skin 后端重构实施报告

## 结论

本次重构已在隔离分支 `codex/backend-architecture-refactor` 完成。实现采用 Express + Mongoose 模块化单体，保留当前 iOS 使用的 `/api` 路径、HTTP method、上传字段和主要响应结构，同时补齐手机号/密码与 Sign in with Apple 双认证。

## 已完成范围

- 启动流程拆分为 app factory、运行时组装、配置校验、数据库连接、HTTP 监听和优雅退出。
- controller、service、model、route、provider、prompt 分层，controller 不再直接访问 AI、OSS 或 MongoDB。
- 手机号注册/登录、密码重置、JWT 吊销、Apple 首登/复登/绑定、账号删除与 Apple revoke。
- 产品 CRUD、私有图片上传、OCR、成分分析；冲突、反馈、方案、皮肤分析全链路。
- 文本、视觉、OCR 使用独立模型映射：`qwen3.7-flash`、`qwen3-vl-plus`、`qwen-vl-ocr-latest`。
- AI 输出执行严格 JSON 解析和 schema 校验，不用默认值伪造健康结果。
- 人脸图片强制私有，产品图可独立配置；私有图片在读取和 AI 调用前重新生成签名 URL。
- 统一请求 ID、结构化访问日志、安全错误响应、Helmet、限流、上传大小与文件签名校验。
- `/health` 和 `/ready`、数据库失败禁止监听、监听失败清理连接、SIGINT/SIGTERM 优雅退出。

## 接口兼容范围

自动化集成测试覆盖当前 iOS 使用的主要链路：

- `/api/users/register|login|me|update-*|stats|logout|delete-account`
- `/api/users/password-reset/request|confirm`
- `/api/users/apple|apple/link`
- `/api/products`、图片上传、OCR、成分分析、兼容 user/label 查询
- `/api/conflicts` 列表、详情、删除和兼容 summary 查询
- `/api/ideas` CRUD
- `/api/plans` 生成、列表、详情、步骤状态、自定义和删除
- `/api/skin-analysis` 上传分析、历史、最新、详情、统计和删除

URL 中的 `userId` 只保留契约兼容，授权和数据过滤始终使用当前 JWT 用户，避免越权读取。

## 自动化验证

当前验证基线：

```text
12 regular test suites passed
57 regular tests passed
1 real local HTTP E2E passed twice consecutively
32/32 real HTTP checkpoints passed per run
0 dependency vulnerabilities
```

测试分为 unit、contract、integration 和显式运行的 real E2E。常规测试使用外部依赖替身；`npm run test:e2e:real` 使用真实 loopback HTTP、内存 MongoDB、阿里 OSS、`qwen-vl-ocr-latest`、`qwen3.7-flash` 和 `qwen3-vl-plus`，并验证删除测试对象与账号。Apple 成功授权和短信发送仍使用协议级测试。

## 上线前仍需执行

- 配置 staging/production 的 MongoDB、DashScope、OSS、Apple 和短信密钥。
- 使用 Apple 真机完成首登、复登、绑定和删号 revoke 验收。
- 使用更多非敏感样本继续评估 OCR、皮肤分析、方案和冲突分析的业务效果；单样本真实 E2E 已通过。
- 按 [Nginx.md](Nginx.md) 配置 Nginx，执行 `nginx -t`，再验证 `/health`、`/ready` 和完整发布 smoke。
- 确认 `127.0.0.1:5000` 未被其他系统服务占用，或通过 `PORT` 选择未占用端口并同步更新 Nginx upstream。
