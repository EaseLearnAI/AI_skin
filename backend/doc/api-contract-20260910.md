# iOS 接口契约快照 · 2026-09-10

来源是当前 `ios_aiskin/AIskin/Services/*ApiService.swift` 的实际 `apiClient` 请求，以及后端 `src/routes`。将 Swift 插值统一为路径参数，并将 multipart `upload` 计为 POST，去重得到 **44 项 method/path 契约**。这是 Service 的接口声明集合，不代表每一项都会由当前首屏触发；邮箱重载等兼容调用共享相同路径。

- Debug 基址：`http://127.0.0.1:5001/api`；Release 基址：`https://www.lunzo.site/api`。
- 认证通过 `Authorization: Bearer <token>`。路径 userId 只用于历史 URL 兼容，资源权限仍由已认证用户决定。
- 上传字段：产品 `productImage`，肤质 `faceImage`；保留 `success/message/data/error` 兼容包络、ISO 8601 日期与 `_id/id` 解码规则。
- 当前 Swift 已实现 `/users/apple` 请求，参数包含 `identityToken`、`authorizationCode`、`rawNonce` 和可选姓名。静态请求存在不代表已完成真实 Apple 账号授权验收。

## 44 项 Swift Service 契约

| Method | 后端路径 | Swift 调用位置 |
| --- | --- | --- |
| GET | `/api/conflicts` | [ConflictApiService.swift:234](/Users/mac/Documents/ChatGPT/ios_aiskin/AIskin/Services/ConflictApiService.swift:234) |
| POST | `/api/conflicts` | [ConflictApiService.swift:116](/Users/mac/Documents/ChatGPT/ios_aiskin/AIskin/Services/ConflictApiService.swift:116) |
| DELETE | `/api/conflicts/:id` | [ConflictApiService.swift:336](/Users/mac/Documents/ChatGPT/ios_aiskin/AIskin/Services/ConflictApiService.swift:336) |
| GET | `/api/conflicts/:id` | [ConflictApiService.swift:282](/Users/mac/Documents/ChatGPT/ios_aiskin/AIskin/Services/ConflictApiService.swift:282) |
| GET | `/api/plans` | [PlanApiService.swift:138](/Users/mac/Documents/ChatGPT/ios_aiskin/AIskin/Services/PlanApiService.swift:138) |
| POST | `/api/plans` | [PlanApiService.swift:112](/Users/mac/Documents/ChatGPT/ios_aiskin/AIskin/Services/PlanApiService.swift:112) |
| DELETE | `/api/plans/:id` | [PlanApiService.swift:269](/Users/mac/Documents/ChatGPT/ios_aiskin/AIskin/Services/PlanApiService.swift:269) |
| GET | `/api/plans/:id` | [PlanApiService.swift:163](/Users/mac/Documents/ChatGPT/ios_aiskin/AIskin/Services/PlanApiService.swift:163) |
| GET | `/api/plans/:id/daily` | [PlanApiService.swift:77](/Users/mac/Documents/ChatGPT/ios_aiskin/AIskin/Services/PlanApiService.swift:77) |
| PUT | `/api/plans/:id/daily/steps` | [PlanApiService.swift:84](/Users/mac/Documents/ChatGPT/ios_aiskin/AIskin/Services/PlanApiService.swift:84) |
| PATCH | `/api/plans/:id/step` | [PlanApiService.swift:202](/Users/mac/Documents/ChatGPT/ios_aiskin/AIskin/Services/PlanApiService.swift:202) |
| GET | `/api/plans/active` | [PlanApiService.swift:64](/Users/mac/Documents/ChatGPT/ios_aiskin/AIskin/Services/PlanApiService.swift:64) |
| PUT | `/api/plans/active` | [PlanApiService.swift:71](/Users/mac/Documents/ChatGPT/ios_aiskin/AIskin/Services/PlanApiService.swift:71) |
| POST | `/api/plans/custom` | [PlanApiService.swift:242](/Users/mac/Documents/ChatGPT/ios_aiskin/AIskin/Services/PlanApiService.swift:242) |
| GET | `/api/products` | [ProductApiService.swift:203](/Users/mac/Documents/ChatGPT/ios_aiskin/AIskin/Services/ProductApiService.swift:203) |
| POST | `/api/products` | [ProductApiService.swift:118](/Users/mac/Documents/ChatGPT/ios_aiskin/AIskin/Services/ProductApiService.swift:118) |
| DELETE | `/api/products/:id` | [ProductApiService.swift:339](/Users/mac/Documents/ChatGPT/ios_aiskin/AIskin/Services/ProductApiService.swift:339) |
| GET | `/api/products/:id` | [ProductApiService.swift:233](/Users/mac/Documents/ChatGPT/ios_aiskin/AIskin/Services/ProductApiService.swift:233) |
| PUT | `/api/products/:id` | [ProductApiService.swift:86](/Users/mac/Documents/ChatGPT/ios_aiskin/AIskin/Services/ProductApiService.swift:86), [ProductApiService.swift:311](/Users/mac/Documents/ChatGPT/ios_aiskin/AIskin/Services/ProductApiService.swift:311) |
| POST | `/api/products/:id/analyze-ingredients` | [IngredientAnalysisApiService.swift:47](/Users/mac/Documents/ChatGPT/ios_aiskin/AIskin/Services/IngredientAnalysisApiService.swift:47) |
| POST | `/api/products/:id/extract-ingredients` | [ProductApiService.swift:176](/Users/mac/Documents/ChatGPT/ios_aiskin/AIskin/Services/ProductApiService.swift:176) |
| GET | `/api/products/:id/ingredient-analysis` | [IngredientAnalysisApiService.swift:92](/Users/mac/Documents/ChatGPT/ios_aiskin/AIskin/Services/IngredientAnalysisApiService.swift:92) |
| POST | `/api/products/:id/upload-image` | [ProductApiService.swift:149](/Users/mac/Documents/ChatGPT/ios_aiskin/AIskin/Services/ProductApiService.swift:149) |
| GET | `/api/products/user/:userId` | [ProductApiService.swift:257](/Users/mac/Documents/ChatGPT/ios_aiskin/AIskin/Services/ProductApiService.swift:257) |
| GET | `/api/products/user/:userId/label/:label` | [ProductApiService.swift:279](/Users/mac/Documents/ChatGPT/ios_aiskin/AIskin/Services/ProductApiService.swift:279) |
| GET | `/api/skin-analysis` | [SkinAnalysisApiService.swift:195](/Users/mac/Documents/ChatGPT/ios_aiskin/AIskin/Services/SkinAnalysisApiService.swift:195) |
| DELETE | `/api/skin-analysis/:id` | [SkinAnalysisApiService.swift:311](/Users/mac/Documents/ChatGPT/ios_aiskin/AIskin/Services/SkinAnalysisApiService.swift:311) |
| GET | `/api/skin-analysis/:id` | [SkinAnalysisApiService.swift:226](/Users/mac/Documents/ChatGPT/ios_aiskin/AIskin/Services/SkinAnalysisApiService.swift:226) |
| PATCH | `/api/skin-analysis/:id/context` | [SkinAnalysisApiService.swift:161](/Users/mac/Documents/ChatGPT/ios_aiskin/AIskin/Services/SkinAnalysisApiService.swift:161) |
| POST | `/api/skin-analysis/analyze` | [SkinAnalysisApiService.swift:31](/Users/mac/Documents/ChatGPT/ios_aiskin/AIskin/Services/SkinAnalysisApiService.swift:31) |
| GET | `/api/skin-analysis/latest` | [SkinAnalysisApiService.swift:253](/Users/mac/Documents/ChatGPT/ios_aiskin/AIskin/Services/SkinAnalysisApiService.swift:253) |
| GET | `/api/skin-analysis/stats` | [SkinAnalysisApiService.swift:281](/Users/mac/Documents/ChatGPT/ios_aiskin/AIskin/Services/SkinAnalysisApiService.swift:281) |
| POST | `/api/users/apple` | [UserApiService.swift:92](/Users/mac/Documents/ChatGPT/ios_aiskin/AIskin/Services/UserApiService.swift:92) |
| DELETE | `/api/users/delete-account` | [UserApiService.swift:405](/Users/mac/Documents/ChatGPT/ios_aiskin/AIskin/Services/UserApiService.swift:405) |
| POST | `/api/users/login` | [UserApiService.swift:167](/Users/mac/Documents/ChatGPT/ios_aiskin/AIskin/Services/UserApiService.swift:167), [UserApiService.swift:195](/Users/mac/Documents/ChatGPT/ios_aiskin/AIskin/Services/UserApiService.swift:195) |
| POST | `/api/users/logout` | [UserApiService.swift:380](/Users/mac/Documents/ChatGPT/ios_aiskin/AIskin/Services/UserApiService.swift:380) |
| GET | `/api/users/me` | [UserApiService.swift:255](/Users/mac/Documents/ChatGPT/ios_aiskin/AIskin/Services/UserApiService.swift:255) |
| POST | `/api/users/password-reset/confirm` | [UserApiService.swift:236](/Users/mac/Documents/ChatGPT/ios_aiskin/AIskin/Services/UserApiService.swift:236) |
| POST | `/api/users/password-reset/request` | [UserApiService.swift:217](/Users/mac/Documents/ChatGPT/ios_aiskin/AIskin/Services/UserApiService.swift:217) |
| POST | `/api/users/register` | [UserApiService.swift:110](/Users/mac/Documents/ChatGPT/ios_aiskin/AIskin/Services/UserApiService.swift:110), [UserApiService.swift:140](/Users/mac/Documents/ChatGPT/ios_aiskin/AIskin/Services/UserApiService.swift:140) |
| GET | `/api/users/stats` | [UserApiService.swift:353](/Users/mac/Documents/ChatGPT/ios_aiskin/AIskin/Services/UserApiService.swift:353) |
| PATCH | `/api/users/update-age` | [UserApiService.swift:333](/Users/mac/Documents/ChatGPT/ios_aiskin/AIskin/Services/UserApiService.swift:333) |
| PATCH | `/api/users/update-gender` | [UserApiService.swift:307](/Users/mac/Documents/ChatGPT/ios_aiskin/AIskin/Services/UserApiService.swift:307) |
| PATCH | `/api/users/update-username` | [UserApiService.swift:280](/Users/mac/Documents/ChatGPT/ios_aiskin/AIskin/Services/UserApiService.swift:280) |

## 已支持且必须保留的其他接口

以下能力虽然不在上述当前 Swift 请求集合中，但仍由当前运行时挂载，不能当作无引用代码删除：

| Method / 路径 | 当前证据 |
| --- | --- |
| `POST /api/users/apple/link` | `src/routes/user.route.js` 挂载；auth 集成测试验证已登录账号绑定 |
| `PATCH /api/users/update-menstrual-cycle` | `src/routes/user.route.js` 挂载；保留现有请求和响应 |
| `GET /api/conflicts/user/:userId` | `src/routes/conflict.route.js` 的 summary 接口；businessFlows 验证用户隔离 |
| `GET /api/conflicts/detail/:id` | 同文件的详情兼容路径，复用同一个 get controller |
| `POST / GET /api/ideas`、`GET / PUT / DELETE /api/ideas/:id` | `src/routes/index.js` 挂载 idea router；businessFlows 验证反馈 CRUD 权限 |
| `GET /health`、`GET /ready` | `src/app.js` 挂载；contract / runtimeSmoke 测试覆盖 |

本次清理移除的是零运行时引用的根目录兼容转发和过时的手工测试脚本，不删除任何上述 HTTP 接口。历史文档中的旧模型文件名和旧脚本名只表示当时实现，运行说明统一以根 README、tests/README 和本快照为准。

## 与旧基线的差异

旧文档的 38 项基线遗漏了后续增加的 Apple 登录（1）、当前方案读写（2）、每日步骤读写（2）和检测备注（1）。上述合计 6 项已在 Swift Service 和当前 routes 中核对，现共 44 项。后续变更应重新提取，不能把本次统计当作永久常量。
