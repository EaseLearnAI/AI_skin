# AIskin 后端架构参考与取舍（2026-09-10）

结论：保留 Express + Mongoose 模块化单体，整理已有公共执行链，成本比更换框架更低。成分分析、肌肤检测确实共享「输入准备 → 模型请求 → 解析校验 → 保存 → 返回」的骨架，但权限、图片生命周期和保存条件属于不同业务，不适合揉进一个包办所有场景的工作流类。

本次直接阅读三个项目的实现与测试，固定到检索时的 Git commit。下文区分上游事实与本项目的设计判断；没有把 README 宣传、GitHub 星数或来源项目的测试状态当作 AIskin 的验收证据。外部源码仅用于比较，没有安装这些框架或执行来源项目代码。

## 1. 与当前技术栈相同的 Express + Mongoose 项目

参考项目为 `hagopj13/node-express-boilerplate`，固定提交 [`179ae84efec61b14206d0305d941daed6c6d07f9`](https://github.com/hagopj13/node-express-boilerplate/commit/179ae84efec61b14206d0305d941daed6c6d07f9)。GitHub 返回的提交时间是 2023-08-12，因此它用于比较稳定的职责划分，不作为 2026 年依赖版本清单。

核实到的请求链是：路由声明鉴权与 `validate`，校验器统一处理 `params/query/body`，控制器委托 service，异常最终进入应用统一错误处理。控制器没有重复编写 Joi 逻辑。[路由实现](https://github.com/hagopj13/node-express-boilerplate/blob/179ae84efec61b14206d0305d941daed6c6d07f9/src/routes/v1/user.route.js#L1-L20)、[校验实现](https://github.com/hagopj13/node-express-boilerplate/blob/179ae84efec61b14206d0305d941daed6c6d07f9/src/middlewares/validate.js#L6-L19)、[控制器实现](https://github.com/hagopj13/node-express-boilerplate/blob/179ae84efec61b14206d0305d941daed6c6d07f9/src/controllers/user.controller.js#L7-L34)、[应用错误出口](https://github.com/hagopj13/node-express-boilerplate/blob/179ae84efec61b14206d0305d941daed6c6d07f9/src/app.js#L54-L67)。

它的用户集成测试通过 `request(app)` 发送 HTTP 请求，并建立测试数据库与用户数据，同时覆盖状态码和返回内容。[集成测试](https://github.com/hagopj13/node-express-boilerplate/blob/179ae84efec61b14206d0305d941daed6c6d07f9/tests/integration/user.test.js#L1-L62)。

**对本项目的判断：** AIskin 已经具备同样的层次和集中校验；无需重新建立一套目录或控制器。现有 `createApp/createRuntime/createDomainServices` 工厂还允许注入外部能力，应保留。公共鉴权、校验、上传、错误处理各维护一份即可。不要照搬来源项目的依赖版本，也不要为了长得像模板而改动 iOS 已使用的响应包络。

## 2. 多种 AI 任务如何共用执行逻辑

参考项目为 Vercel 官方 `vercel/ai`，固定提交 [`5ec21a6946e13159d3c353c3fcd170ca8564d378`](https://github.com/vercel/ai/commit/5ec21a6946e13159d3c353c3fcd170ca8564d378)，提交时间为 2026-09-09 22:17:31 UTC。

在该版本里，模型调用与结构化输出策略分开。已读取的 `generateObject` 实现通过模型的 `doGenerate` 发起请求，再进入结果解析校验；但这个入口已经标记弃用，源码推荐 `generateText` 配合 `output`，因此本次不推荐引入旧入口。[调用链及弃用说明](https://github.com/vercel/ai/blob/5ec21a6946e13159d3c353c3fcd170ca8564d378/packages/ai/src/generate-object/generate-object.ts#L120-L121)、[模型调用](https://github.com/vercel/ai/blob/5ec21a6946e13159d3c353c3fcd170ca8564d378/packages/ai/src/generate-object/generate-object.ts#L398-L417)、[输出处理](https://github.com/vercel/ai/blob/5ec21a6946e13159d3c353c3fcd170ca8564d378/packages/ai/src/generate-object/generate-object.ts#L470-L480)。

当前 `Output.object` 的完整输出处理先解析 JSON，再进行 schema 校验，失败会带上输出文本、响应、用量和结束原因。其部分输出路径没有完整校验，不能把中途片段当作已完成报告。[完整输出策略](https://github.com/vercel/ai/blob/5ec21a6946e13159d3c353c3fcd170ca8564d378/packages/ai/src/generate-text/output.ts#L123-L180)。

测试替身 `MockLanguageModelV4` 实现相同的模型接口，可以注入生成函数或结果序列，并记录调用参数。这支持验证请求内容与调用次数，不需要在业务代码里加入测试分支。[测试替身源码](https://github.com/vercel/ai/blob/5ec21a6946e13159d3c353c3fcd170ca8564d378/packages/ai/src/test/mock-language-model-v4.ts#L9-L62)。

**对本项目的判断：** 继续复用一个模型执行器处理请求、JSON 解析、校验、错误映射、耗时与追踪信息；各任务只声明模型配置、提示词、输出 schema 和归一化函数。归一化函数应是纯函数，避免供应商 HTTP 文件同时承载大量护肤领域规则。保留现有五个业务方法，service 不需要感知供应商请求格式。

这里还有一项不能直接照搬：上游 `safeValidateTypes` 在 schema 没有运行时 `validate` 时允许直接通过；AIskin 的报告需要确定的字段契约，应继续强制 Joi 校验。[该分支源码](https://github.com/vercel/ai/blob/5ec21a6946e13159d3c353c3fcd170ca8564d378/packages/provider-utils/src/validate-types.ts#L62-L77)。格式合法也不代表 OCR 或皮肤判断准确，架构重构不会自动修复模型语义错误。

## 3. 统一外部 API 传输与可靠性策略

参考项目为 OpenAI 官方 `openai/openai-node`，固定提交 [`fe2d6a382623b00753f002de539f8a26c936b5be`](https://github.com/openai/openai-node/commit/fe2d6a382623b00753f002de539f8a26c936b5be)，提交时间为 2026-09-09 19:27:46 UTC。这里参考的是客户端封装方式，并不表示 AIskin 应更换当前 DashScope 模型。

客户端在一个入口接收 `timeout/maxRetries/logger/fetch`，允许替换网络实现；请求处理统一检查取消信号、连接错误和重试，响应还可取得上游请求 ID。该版本默认重试两次，按状态码和上游提示判定重试，并处理 `Retry-After`。[构造配置](https://github.com/openai/openai-node/blob/fe2d6a382623b00753f002de539f8a26c936b5be/src/client.ts#L601-L613)、[取消与连接错误](https://github.com/openai/openai-node/blob/fe2d6a382623b00753f002de539f8a26c936b5be/src/client.ts#L1268-L1318)、[重试判定](https://github.com/openai/openai-node/blob/fe2d6a382623b00753f002de539f8a26c936b5be/src/client.ts#L1605-L1683)、[响应请求 ID](https://github.com/openai/openai-node/blob/fe2d6a382623b00753f002de539f8a26c936b5be/src/client.ts#L1001)。

**对本项目的判断：** 现有 `httpClient` 注入、统一超时、`requestId/callId/upstreamRequestId` 已具备正确方向，应集中保留。不要在每个分析 service 再创建 Axios/SDK client，也不要在重构中无意启用默认两次重试：模型请求可能已经执行并计费，超时后的再次发送还可能覆盖用户新输入。真正需要重试时，应单独确定费用、幂等和总等待时间，而不是随依赖升级改变产品行为。

## 4. 本轮可以落地的最小边界

下表是根据已读 AIskin 代码作出的设计建议，不是来源仓库的要求，也不代表表中事项已经完成。实际改动和验证结果以本轮验收记录为准。

| 职责 | 应由哪一处维护 | 降低的后续成本 |
|---|---|---|
| HTTP 校验、鉴权、图片接收 | 现有 route + middleware | 新入口组合已有中间件即可 |
| 当前用户权限、输入版本检查、保存条件 | 对应业务 service | 业务规则可直接阅读，不藏在通用工作流参数里 |
| 五种 AI 任务的模型、提示词、schema、归一化关系 | 一份明确的任务定义 | 新任务不会复制一整套网络与解析代码 |
| 请求、解析、运行时校验、追踪、失败映射 | 一份共享执行器 | 超时、日志和输出错误修复只改一处 |
| OCR、风险等级和肌肤字段归一化 | 可独立测试的纯函数模块 | 调整字段兼容不触碰凭据与网络传输 |
| 私有图片访问、删除与补偿 | 现有 storage provider + 业务边界 | 存储变化不扩散到控制器和前端 |

复用的验收标准应是：同一执行规则只改一处即可覆盖五种 AI 任务；一个任务的业务变更不需要修改其他任务；已有 method/path、multipart 字段和成功响应保持兼容；失败不会返回伪造成功结果。单纯减少文件数或行数不代表达到这些目标。

删除代码前要同时检查模块引用、运行时入口、部署脚本和当前 iOS 契约。尚未被某个页面调用的预留能力，不能仅凭一次文本搜索认定为死代码。确认为另一份实现、无引用旧入口或不可达分支后再删，并用契约测试覆盖现有行为。

暂不引入微服务、通用 DAG 引擎、Redis 队列或完整 Agent 框架。当前任务是确定的同步 API 调用；这些基础设施会增加部署和排障面。将来出现重启后任务恢复、超过请求时限的处理、可量化的排队需求，再评估持久任务机制。以上是本项目范围和成本约束下的取舍，并非认定所有规模都适用同步处理。

## 5. 研究边界

本研究只读取公开仓库源码与本地业务文件，没有调用真实 AI、OSS 或写数据库；没有修改生产源码、依赖、前端接口或提示词。源码阅读能支持职责划分判断，不能代替重构后的测试，也不能证明模型结果准确。本次没有运行上述三个来源项目的测试。
