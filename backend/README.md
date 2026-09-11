# AI Skin Backend

AI Skin 后端采用 Express + Mongoose 模块化单体架构。手机号/密码和 Sign in with Apple 最终都签发同一种应用 JWT；文本、视觉和 OCR 模型通过统一 DashScope Provider 调用。

## 本地运行

```bash
npm ci
# 仅首次配置且尚无 .env 时复制示例
cp .env.example .env
npm run dev
```

本地必须有可连接的 MongoDB。生产环境缺少 JWT、AI、OSS、Apple 或短信网关配置时会拒绝启动。Node 默认只监听 `127.0.0.1`，默认端口为 `5000`，可通过 `PORT` 配置；当前 iOS Debug 指向 `127.0.0.1:5001`，联调时将后端端口设为 `5001`。同一局域网真机联调可用 `BIND_HOST=0.0.0.0 PORT=5001 npm start` 显式监听所有 IPv4 网卡，手机需访问电脑的局域网 IP。公网入口由 Nginx 提供。

## 自动化测试

普通测试使用隔离 MongoDB 和外部服务替身，不连接当前开发 / 生产数据库；未设置 `RUN_REAL_E2E=1` 时，真实外部调用用例会跳过。无需先启动开发服务器，HTTP smoke 会自行使用随机端口。

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
  integration/            真实 Express + 隔离 MongoDB，外部服务使用替身
  e2e/                    显式开启的真实 DashScope / OSS 链路
```

运行入口保留 `server.js`；模型与配置统一从 `src/` 导入，旧根目录兼容转发和独立手工测试已移除。正式测试入口及覆盖范围见 [测试说明](tests/README.md)。真实外部 E2E 需已有调用授权和环境凭据，再运行 `npm run test:e2e:real`；它不等同于 iOS 或生产验收。

## 关键文档

- [2026-09-10 后端复用与清理验收](doc/backend-architecture-20260910.md)
- [GitHub 架构参考与取舍](doc/architecture-references-20260910.md)
- [前次重构实施报告](REFACTOR_IMPLEMENTATION_REPORT.md)
- [后端接口专项测试报告](BACKEND_API_TEST_REPORT.md)
- [生产 OSS 联调报告](PRODUCTION_OSS_TEST_REPORT.md)
- [完整重构方案](BACKEND_ARCHITECTURE_REFACTOR_PLAN.md)
- [服务端与 Nginx 强制规则](Nginx.md)
- [当前 iOS 44 项接口契约及源码位置](doc/api-contract-20260910.md)
- [历史 API 文档](COMPLETE_API_DOCUMENTATION_CN.md)（接口现状以当前契约表及 routes 源码为准）

## 健康检查

- `GET /health`：Node 进程可响应。
- `GET /ready`：应用已完成初始化且 MongoDB 可用。

生产发布前必须执行 `npm ci`、完整测试、`npm run check`、`nginx -t` 和真实设备 Smoke。
