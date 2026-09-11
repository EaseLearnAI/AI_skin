# 产品搭配报告 v2

2026-09-10。修复风险分数空白、化学成分无法对应所选产品、护肤建议堆积早晚步骤与额外推荐的问题。

## 生成和契约

POST /api/conflicts 请求仍为 productIds。AI输入是按用户选择顺序排列的id/name/ingredients，输出riskScore、summary和productPairs；Prompt版本conflict-v4-product-assessment，schema版本conflict-v2-product-report。

productPairs每项包含两个不同的所选productIds、status及最多80字的explanation。status为compatible/caution/avoid/unknown。summary最多60字。服务端先做无损字段名归一化（已观察到前导空格和大小写变化），有同名碰撞则拒绝，再验证分数和全部产品对的完整性。拒绝缺失、重复或外部产品ID。

风险分数是模型对标签的估计，不是临床量表、发生概率或仪器检测值。0–5分，越高越需谨慎。全部compatible对应0–1；最高caution对应(1,3]；存在avoid对应(3,5]；任一unknown时整体分数必须为null。缺失、越界或与状态不一致时拒绝保存，不默认0分。名称和使用方式不明时不允许据成分猜测产品类别；这项语义约束仍需实际内容检查，不能仅靠schema证明。

## 护肤建议是服务端业务逻辑

真实模型两轮曾在自由文本建议中猜测未知产品类别、推荐额外面霜或堆积保湿修护文案。因此模型不再生成recommendations。服务端仅在搭配结论校验通过后，通过buildConflictAdvice根据状态生成1–3条简短行动建议：

- unknown：先确认使用说明。
- avoid：避免同时叠加。
- caution：先分开使用。
- compatible：逐步尝试搭配。
- 有已判断产品对时追加“出现不适就暂停”。

同状态合并所涉及产品ID，最多两条状态建议加一条观察提醒。文本明确针对所选产品，不推荐新产品，不编造分数或判断。这是正式业务生成规则，不是测试桩或冒充模型结果。

## 保存、历史和iOS

公开响应新增reportVersion=2、riskScore、summary、productPairs，recommendations.advice每项为productIds/title/detail。停止生成safeCombo、成分组合冲突列表、额外产品推荐及晨晚流程。所有新字段与产品快照一同保存，POST/GET列表/GET详情一致。

iOS通过同一ConflictReportContent展示生成结果和历史结果，产品名称完整换行。建议正文只显示1–3条短行动，删除可搭配组合。旧记录仍可读取，但不伪造缺失的评分和产品关系，提供重新检测入口。兼容产品_id/id。

## 验证

最终后端默认回归：16套135项通过，真实完整E2E套件1项默认跳过。日志/tmp/aiskin-conflict-backend-tests-final.log。包括多产品对覆盖、分数/状态一致性、异常文本/键名、状态建议生成、POST与历史列表/详情一致性和快照保持。npm run check与git diff --check通过。

真实AI、原生UI及最终截图单独记录在iOS仓库doc/联调验收/2026-09-10-冲突报告/README.md。未部署生产。

AI_OUTPUT_INVALID最多自动纠正一次，附带长度和字段要求；其他异常不自动重试。二次失败不落库，两条分支均有集成测试。
