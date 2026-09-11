# 柔光圆环 iOS 并行接口契约（2026-09-09）

所有路径以下省略 `/api`，均要求 Bearer Token。原有手机号注册、登录与方案生成前置条件保持不变；新增接口不调用 AI。

## 当前方案

- `GET /plans/active` → `{ "success": true, "data": { "plan": <既有 Plan 或 null> } }`
- `PUT /plans/active`，请求 `{ "planId": "<ObjectId>" }` 或 `{ "planId": null }`，响应同上。
- 显式采用与生成独立。生成和自定义创建都不会覆盖当前采用方案。
- 旧用户 `activePlanId` 字段缺失时，首次读取/创建前原子初始化为此前最近的方案，没有旧方案则初始化为 null。新创建方案不会成为这次兼容初始化的候选。
- 显式清空后保持 null；不会再次退回最新方案。删除采用中的方案会清空指针。
- 用户只能采用自己的方案，外部 ID 返回 404。

## 每日步骤

- `GET /plans/:id/daily?date=2026-09-09&timezone=Asia%2FShanghai`
- `PUT /plans/:id/daily/steps`，请求：

```json
{"date":"2026-09-09","timezone":"Asia/Shanghai","period":"morning","step":1,"completed":true}
```

响应：

```json
{"success":true,"data":{"daily":{"planId":"<ObjectId>","date":"2026-09-09","timezone":"Asia/Shanghai","morning":[{"step":1,"completed":true}],"evening":[{"step":1,"completed":false}],"completedCount":1,"totalCount":2}}}
```

- 日期必须为真实日历日期；时区为系统支持的 IANA 时区，别名标准化。
- 唯一键为用户、方案、日期。第一次写入保留时区；同日期换到不同标准时区返回 `409 DAILY_TIMEZONE_CONFLICT`，不另建重复记录。
- 每步使用原有 `period + step` 标识。当前方案 API 没有修改内容的接口，因此不引入额外执行版本。
- 重复设置同一状态不重复计数，不同步骤并发更新互不覆盖。跨日初始状态为空。
- 实现选择：切换方案保留历史；同日切回恢复该方案当日进度。日记录不写入旧的 Plan.completed/done。
- 原 `PATCH /plans/:id/step` 保留兼容，其永久状态与新每日记录互不影响。新 iOS 必须调用新每日接口。
- 暂不提供“累计一天”的统计口径。删除方案删除其日记录，删除账号同样清理日记录。

## 产品开封

`POST /products` 和 `PUT /products/:id` 新增 `openingStatus: unknown | unopened | opened`。

- 旧记录有日期则读出 opened，无日期则 unknown；兼容旧列表路径。
- 旧客户端只提交非空 openingDate 时推断 opened，提交 null 时推断 unknown。
- 显式 unopened 或 unknown 会清空 openingDate；opened 允许未知具体日期。
- 修改其他字段不改变既有开封状态。

## 检测备注

`PATCH /skin-analysis/:id/context` 支持 `{condition, light, feelings:[string]}` 的非空部分更新；`data.analysis` 返回完整记录及 context。

- condition/light 最多 200 字符，可空字符串；feelings 最多 20 个唯一项目，每项 1–100 字符，可空数组。
- 备注不会重跑 AI、覆盖 AI 判断或改变检测日期。读取图片沿用私有签名逻辑，不返回 storageKey 或原始模型输出。

## 其他肤况观察的稳定契约

`analysis.otherIssues` 为固定对象，仅允许以下可选字段。未观察到或无法判断的值省略，不自动补 `exists:false`、严重度或评分：

- `redness`：对象，允许 `exists:bool`、`severity:string`、`distribution:[string]`、`description:string`。
- `hyperpigmentation`：对象，允许 `exists`、`severity`、`types:[string]`、`distribution`、`description`。
- `fineLines`：对象，允许 `exists`、`severity`、`distribution`、`description`。
- `sensitivity`：对象，允许 `exists`、`severity`、`signs:[string]`、`description`。
- `skinToneEvenness`：对象，允许 `description`；兼容保留已有的整数 `score`，新提示词禁止无测量依据地生成此评分。
- `description:string`：一般观察文字。
- `observations:[{category:string,details:[string]}]`：其他自由观察和历史非规范内容。

真实上传曾返回 `redness:["鼻翼两侧轻微泛红"]` 与 `texture:[...]`，后端现无损转换为：

```json
{"observations":[{"category":"redness","details":["鼻翼两侧轻微泛红"]},{"category":"texture","details":["原始纹理观察"]}]}
```

字符串数组保持逐项文字；未知嵌套值以原字段路径作 category、JSON 文本作 details 保留，不删除内容，也不推断疾病或数值。已有规范对象及字段直接保留。iOS 应展示 observations，同时兼容已缓存的旧字符串/数组记录。

新 AI 输出先无损归一化再按固定 schema 严格校验，不再使用 `unknown(true)`。现行版本为 `promptVersion=skin-v3-other-issues`、`schemaVersion=skin-v2-other-issues`。历史记录读取时复用同一转换，仅改变响应，不改写数据库中原有观察；回归已验证读前读后原数组相同。

## 冲突历史

新分析保存产品名称、描述、成分和标签快照。详情及列表以快照还原分析当时产品，避免改名/删除后历史内容丢失；图片仅从仍存在的产品读取。旧记录仍按现有引用读取，已经丢失的历史内容无法补造。

## 本地运行

现有本机 MongoDB 监听 `127.0.0.1:27017`，持久化目录为 `~/Library/Application Support/AISkin/mongodb/data`。本轮推荐独立数据库 `aiskin_prototype_20260909`，保留已有数据库。

5000 端口由 macOS ControlCenter 使用；本轮建议 `PORT=5001`。运行入口继续为 `node server.js`，监听 127.0.0.1。启动前复查端口占用，不清理无关进程。

真实 AI/OSS 测试要求 `API_KEY`、`OSS_REGION`、`OSS_ACCESS_KEY_ID`、`OSS_ACCESS_KEY_SECRET`、`OSS_BUCKET`。Apple 新用户首次登录还需要 APPLE_TEAM_ID、APPLE_KEY_ID、APPLE_PRIVATE_KEY、APPLE_REFRESH_TOKEN_ENCRYPTION_KEY；audience 默认为 personal.AIskin，须匹配 App。

## 验证边界

`tests/integration/prototypeFlows.integration.test.js` 使用真实临时 MongoDB 和 Express HTTP，认证身份、AI 和 OSS 为测试替身；覆盖采用/迁移、日期/时区、并发/幂等、越权、开封兼容、备注和历史快照。全套 `npm test` 默认跳过真实外部 E2E；真实外部测试需独立运行并报告。

## 本轮实际本地运行证据

- 本地服务 `http://127.0.0.1:5001`，独立持久数据库 `aiskin_prototype_20260909`；启动 PID 写于 `/tmp/aiskin-prototype-backend-20260909.pid`，服务日志 `/tmp/aiskin-prototype-backend-20260909.log`。`.env` 被 Git 忽略、权限 600，使用新随机本地 JWT；未复用其他项目的数据库/JWT。
- `/health` 与 `/ready` 返回 200；通过该常驻服务执行真实 HTTP 注册、创建自定义方案、读取空采用状态、采用方案、每日打卡、未开封产品创建及删除测试账号，全部通过。
- 全部默认测试 68 项通过（13 suites），真实 E2E 默认跳过。8 项新增集成测试使用临时真实 MongoDB。
- 已实际运行真实外部 E2E：手机号注册/登录与 OSS 私有产品图上传成功，失败后的测试账号/对象清理成功；第一次运行首个 OCR 上游返回 401 `invalid_api_key`；随后配置了专用有效凭据及工作空间提供的兼容端点，OCR、成分、冲突、方案均已真实通过。日志 `/tmp/aiskin-real-e2e-20260909.log`；凭据问题已修复；最新完整复跑日志为 `/tmp/aiskin-real-e2e-20260909-final.log`。
- Apple 首次真实登录仍缺少签名密钥配置；invalid Apple credential 被 401 拒绝已验证，不代表 Apple 登录成功。

### 真实检测契约修复

真实照片请求暴露了旧提示词未约束 subtype 等枚举的问题，模型返回“轻度混合倾向”时被 schema 正确拒绝。提示词现已列明全部现有字段枚举与数组类型，第一次修复版本为 `skin-v2-enums` / `skin-v1`，现行版本见上方其他肤况契约；不将含糊描述伪造映射为已验证分类。新增回归锁定该拒绝边界。

修复后 UI 验收账号已通过真实 API 创建产品成分报告与肌肤报告，肌肤 context 注明固定测试图片、仅供界面联调；不代表用户实际肤质。常驻 PID 后续有更新，以 PID 文件及末尾最终复核为准。

### 完整真实外部 E2E 验证（其后另有 UI 联调修复）

- `npm run check` 通过；默认全套 68 tests / 13 suites 通过，真实 E2E 在默认命令中仍按设计跳过。
- 已单独运行真实外部 E2E 并通过：1 test，39 个真实 HTTP 检查点，85.637 秒；包括两次 OCR、真实成分/冲突/方案/肌肤分析、OSS 上传与删除、方案采用、每日幂等和跨日、开封状态、检测备注、历史查询、注销与账号清理。
- 全链路使用真实临时 MongoDB、真实 HTTP 和真实 AI/OSS；Apple 成功登录未包含在内，仅非法凭据拒绝通过。
- 常驻本地服务及持久数据库继续运行；UI 账号的真实成分报告和真实肌肤报告分别再次读取 200。最新日志 `/tmp/aiskin-real-e2e-20260909-final.log` 与 `/tmp/aiskin-backend-tests-final-20260909.log`。

### iOS 图片 HTTPS 修复

真实联调发现 OSS SDK 的 Node 默认 `secure:false`，导致签名图片使用 HTTP，被 iOS ATS 拦截。现已在唯一 OSS client 工厂设置 `secure:true`；历史公开图片读取也升级 HTTPS，不放宽 ACL 或 ATS。真实 SDK 离线签名测试验证 HTTPS，存储及两组业务集成共 22 项测试通过，`npm run check` 与差异检查通过。

该次修复后的进程已被后续契约修复重启，以 PID 文件及末尾最终复核为准。现有 UI 产品与肌肤详情接口均返回 HTTPS 图片链接，实际下载分别 200 / 742578 bytes 和 200 / 45364 bytes。模型未改动，本次未重复计费 AI E2E。

### 最终当前源码复核

- 当前源码完整默认回归：**74 tests / 14 suites 全部通过**；真实 AI E2E 的 1 test / 1 suite 按设计跳过，总计 75 tests / 15 suites。耗时 14.713 秒，日志 `/tmp/aiskin-backend-tests-complete-20260909.log`。
- `npm run check`、`git diff --check` 通过。此次仅默认回归，没有重复付费 AI 调用或重启。
- 当前常驻 PID **63713**，监听 `127.0.0.1:5001`，`/health` 与 `/ready` 实测均 200。后续进程以 `/tmp/aiskin-prototype-backend-20260909.pid` 为准。
- 真实 UI 上传产生的旧非规范记录已读取验证：redness 与 texture 各一条原文进入 observations，没有补造状态或评分；数据库不改写由新增集成测试证明。iOS 侧上传、报告/历史、观察文本与兼容测试验收结果由前端验收记录提供。
