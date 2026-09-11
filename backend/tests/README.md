# 后端测试入口

当前测试由 Jest 统一发现和执行。`package.json` 只匹配 `tests/**/*.test.js`；旧的独立 `node tests/*_test.js` 脚本已移除。它们使用过时的邮箱认证、固定端口和重复流程，不再作为验收入口。

## 安装与运行

在 `backend` 目录使用锁文件安装依赖：

```bash
npm ci
npm test
npm run test:unit
npm run test:contract
npm run test:integration
npm run check
```

普通测试不需要先运行 `npm run dev`。单元测试使用注入的配置及依赖；集成测试使用隔离的 `mongodb-memory-server`。`runtimeSmoke` 会在随机 loopback 端口启动自己的 HTTP 运行时，并在完成后关闭。它们不依赖当前本地服务或生产数据库。

未设置 `RUN_REAL_E2E=1` 时，`npm test` 跳过真实外部调用用例；普通集成测试中的 AI、OSS、Apple 和短信使用测试替身。这能验证业务与数据库流程，不能证明真实模型或外部服务正常。

## 覆盖范围

| 目录 / 文件 | 作用 |
| --- | --- |
| `unit/` | 配置默认值与覆盖、模型输出归一化、Provider、存储、Apple、短信、生命周期 |
| `contract/app.contract.test.js` | 应用挂载、健康检查和 HTTP 错误约定 |
| `integration/auth.integration.test.js` | 手机号认证、Apple 登录 / 绑定、密码重置、资料修改和注销 |
| `integration/businessFlows.integration.test.js` | 产品上传 / OCR / 成分分析、冲突、反馈、肤质、方案、权限和删除 |
| `integration/prototypeFlows.integration.test.js` | 当前方案、每日步骤、产品开封状态、检测备注、历史兼容 |
| `integration/analysisIntegrity.integration.test.js` | 图片替换失败回滚、数据完整性、模型溯源和缺失指标 |
| `integration/runtimeSmoke.integration.test.js` | 真实本地 HTTP listener 与隔离 MongoDB 的核心链路 |
| `e2e/realLocal.e2e.test.js` | 明确开启后调用真实 DashScope / OSS，并验证实际 HTTP、MongoDB 与清理 |

模型配置只有 `src/config/config.js` 的 `loadConfig` 一处实现；原兼容导出测试已合并进 `unit/config.test.js`，默认值和覆盖行为继续验证。

## 真实外部服务 E2E

真实 E2E 会产生模型调用费用及临时 OSS 对象。运行前需已有授权，并在进程环境或本地 `.env` 中配置 `API_KEY`、`OSS_REGION`、`OSS_ACCESS_KEY_ID`、`OSS_ACCESS_KEY_SECRET`、`OSS_BUCKET`，不在文档或日志中打印真实值。

```bash
npm run test:e2e:real
```

仅显式开启真实 E2E 时才读取 `.env`，已有进程环境优先。测试使用 `loadConfig` 的同一份模型配置，不在测试中另设 OCR/文本/视觉模型。该用例自行启动隔离 MongoDB 与随机端口的应用，使用 `tests/product.png` 和 `tests/face.jpg`；这两张图仍是正式 E2E 资源，不能随旧脚本删除。实际读取、持久化及删除断言通过才属于外部链路证据；另会核对三次图片上传的 SHA-256 与原文件一致，并确认删除后的签名 URL 返回 404。Apple 成功授权、实际短信接收和 iOS 原生渲染仍需对应的专项验收。

测试脚本不会自动安装缺失依赖、后台启动长期开发服务或以固定等待时长假定服务就绪。
