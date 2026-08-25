# AI Skin Backend

AI Skin 后端采用 Express + Mongoose 模块化单体架构。手机号/密码和 Sign in with Apple 最终都签发同一种应用 JWT；文本、视觉和 OCR 模型通过统一 DashScope Provider 调用。

## 本地运行

```bash
npm ci
cp .env.example .env
npm run dev
```

本地必须有可连接的 MongoDB。生产环境缺少 JWT、AI、OSS、Apple 或短信网关配置时会拒绝启动。Node 只应监听 `127.0.0.1:5000`，公网入口由 Nginx 提供。

## 自动化测试

测试使用 `mongodb-memory-server`，不会连接生产 MongoDB、Apple、DashScope、OSS 或短信服务。

```bash
npm test
npm run test:unit
npm run test:contract
npm run test:integration
npm run check
```

## 目录

```text
src/
  app.js                  Express 应用、中间件、路由和错误处理
  index.js                配置、依赖组装、数据库和服务生命周期
  config/                 环境变量校验
  controllers/            HTTP 输入输出
  services/               业务规则、权限和事务边界
  models/                 Mongoose schema/index
  routes/                 路由、认证、校验和上传限制
  providers/              Apple、DashScope、OSS、短信外部协议
  prompts/                独立版本化提示词
tests/
  unit/                   Provider、配置和生命周期
  contract/               稳定 HTTP 契约
  integration/            真实 Express + 内存 MongoDB 全链路
```

根目录的 `models/` 只作为历史脚本兼容导出；生产运行时和所有新代码必须使用 `src/`。

## 关键文档

- [本次重构实施报告](REFACTOR_IMPLEMENTATION_REPORT.md)
- [后端接口专项测试报告](BACKEND_API_TEST_REPORT.md)
- [生产 OSS 联调报告](PRODUCTION_OSS_TEST_REPORT.md)
- [完整重构方案](BACKEND_ARCHITECTURE_REFACTOR_PLAN.md)
- [服务端与 Nginx 强制规则](Nginx.md)
- [API 文档](COMPLETE_API_DOCUMENTATION_CN.md)

## 健康检查

- `GET /health`：Node 进程可响应。
- `GET /ready`：应用已完成初始化且 MongoDB 可用。

生产发布前必须执行 `npm ci`、完整测试、`npm run check`、`nginx -t` 和真实设备 Smoke。
