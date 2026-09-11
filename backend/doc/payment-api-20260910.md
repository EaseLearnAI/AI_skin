# 支付与会员服务端接口（2026-09-10）

本轮实现支付宝固定期限会员的服务端链路，并保留后续 Apple 内购 provider 的扩展位置。月度/年度商品都是单次付款购买一段会员期限，`autoRenew` 固定为 `false`，没有自动扣款协议。当前价格属于可配置的产品草案，上线前须与实际商品展示核对。

本文件描述新接口，不改变现有 iOS 44 项接口。下文接口前缀为 `/api/payments`。除支付宝通知外均需 `Authorization: Bearer <token>`，服务端从 JWT 确认订单归属，不接受客户端指定付款权益的用户。

## 接口契约

| 方法与路径 | 输入 | 成功输出的 `data` |
| --- | --- | --- |
| `GET /catalog` | 无 | `{provider:'alipay', environment, available, products:[...]}` |
| `POST /orders` | `{productId, idempotencyKey}` | HTTP 201，`{order, payment:{orderString}}` |
| `GET /orders/:id` | 本站订单 ID | `{order}` |
| `POST /orders/:id/refresh` | 本站订单 ID | `{order}`，服务端向支付宝查询并核验结果 |
| `POST /alipay/notify` | 支付宝 form-urlencoded 通知，含 RSA2 签名 | HTTP 200，纯文本 `success`；验证或处理失败不得回复成功 |
| `GET /membership` | 无 | `{tier:'free'|'member', validUntil, provider, autoRenew:false}` |

JSON 成功响应继续使用 `{success:true, data:...}` 包络；失败响应继续使用 `success/message/code/requestId`。通知成功响应是支付宝要求的文本回执，不套 JSON 包络。

商品由服务端定义：

```json
[
  {"id":"member_month","amountFen":1200,"currency":"CNY","durationMonths":1},
  {"id":"member_year","amountFen":8800,"currency":"CNY","durationMonths":12}
]
```

订单公开字段至少包括 `id/outTradeNo/productId/amountFen/currency/status/expiresAt`。`id` 用于 App 查询本站记录，`outTradeNo` 用于支付宝商户订单核对。金额内部按整数分记录，provider 请求按两位小数元传递。App 只提交商品 ID，不能指定金额、期限、付款状态或会员等级。

同一用户的 `idempotencyKey` 表示同一笔购买尝试。网络重试必须复用该值：相同商品返回同一订单，不产生第二段权益；同一键改为另一商品返回 HTTP 409 `PAYMENT_IDEMPOTENCY_CONFLICT`。新一次真实购买使用新键。其他用户读取或刷新此订单返回 404。

## 支付确认链路

1. 已登录 App 获取商品目录，调用建单接口。
2. 服务端固定用户、商品、金额、订单有效期，持久化订单并取得签名 `orderString`。
3. App 通过支付宝 SDK 调起支付。SDK 返回只用于提示和触发查询，不能作为开通会员的证据。
4. App 刷新本站订单；支付宝通知也可独立到达。服务端向支付宝查单，核对商户订单号、金额、交易状态和提供的支付宝交易号；返回 sellerId 时必须匹配当前商户。
5. 通知先验签，再核对 `app_id/seller_id/out_trade_no/trade_no/total_amount`，并以商户查询交叉确认。无效签名返回 `PAYMENT_INVALID_SIGNATURE`；标识或金额不一致返回 `PAYMENT_MISMATCH`，均不发放权益。
6. 确认付款后幂等记录权益。重复通知、并发通知和刷新重试不得重复延长期限。不同已付款订单可顺延会员期限。
7. App 查询会员状态，以服务端结果更新界面。未付款、上游查询失败、未知交易状态均不得开通会员。

已付款账本的查单验证最多缓存 5 分钟。`GET /membership` 遇到验证时间过期的付款记录时主动查单，发现已关闭的既有付款时收回该单权益，以覆盖退款通知遗漏。刷新失败返回错误，不能将超过缓存期限的记录包装成刚确认有效的会员；暂时查询失败不删除原有付款账本，后续查询成功可以恢复正常读取。

`available:false` 表示支付尚未配置或关闭，此时 App 应展示当前会员权益并明确支付暂不可用，不应模拟支付成功。

会员期限直接从当前用户、当前支付环境的已核验订单账本计算，不再额外写入一份可发生部分提交的会员余额。每段从 `max(该单 paidAt, 上一段有效期末尾)` 开始，按 UTC 日历月累加，月底不存在同一日时取该月最后一天。到账时间优先取查单 `sendPayDate`，必要时取已验签通知的 `gmt_payment`；支付宝传统时间字符串按中国标准时间解释。重复查询不重写既有到账时间。

## 退款与期限

退款通知需正常验签和订单核验，并使用累计 `refund_fee`、`gmt_refund`、`out_biz_no` 等证据。部分退款保留这一期权益；累计退款达到此单原金额时撤销该订单所对应权益。累计退款额只能取更大值，迟到的小额退款或旧成功通知不得恢复已撤销权益。

单次付款会员到期后返回免费状态；不会自动扣费。删除 App 账户时，支付订单解除用户绑定（`owner:null`），保留处理退款和迟到通知所需的最小订单账本。旧通知不得重新建立用户或给同手机号注册的新账户开通权益；订单读取接口不暴露用户关联、商户配置、支付宝交易号、幂等键或签名原文。退款发起不属于当前客户端接口，需在商户后台执行后由回调同步，或在后续单独增加受控管理能力。

从未购买时 `validUntil:null`；过期后 `tier:'free'` 仍可能保留历史有效期日期，App 应以 `tier` 判断当前会员状态，不应仅以日期字段存在判断开通。

## 配置与环境

本轮基础配置包括 `ALIPAY_ENABLED`、`ALIPAY_ENVIRONMENT`、`MEMBERSHIP_MONTH_PRICE_FEN`、`MEMBERSHIP_YEAR_PRICE_FEN`。商户 App ID、seller ID、应用私钥、支付宝公钥或证书、网关与通知地址由 provider 配置统一读取；准确字段以 `.env.example` 和 provider 实现为准。私钥不进入 App、浏览器或响应，不记录完整签名订单和通知载荷。

沙盒与生产分别使用对应账号、密钥、网关和交易记录。已有 `APPLE_TEAM_ID/APPLE_KEY_ID/APPLE_PRIVATE_KEY` 是 Apple 登录配置，不能据此宣布 App Store 内购已配置。

支付宝实际开通仍需验证商户/个人 AI 收款资格、签约产品和应用审核状态。取得个人 AI 收款能力不等于自动扣款资格，也不等于 App Store 数字会员允许改用第三方支付。中国大陆 iOS 上架的数字会员仍应按 Apple 当前审核规则接入内购；这条支付宝链路用于获准的发行和支付场景。

### 只读沙箱网关检查

`scripts/check-alipay-sandbox.js` 只调用沙箱 `alipay.trade.query`，不会建支付单、扣款、退款或写入应用数据库。默认仅读取后端目录下的 `.env.alipay.sandbox`，不读取已有 `.env`，不合并或更改其他项目的进程环境变量。

用户在本机单独保存沙箱配置，至少设置 `ALIPAY_ENABLED=true`、`ALIPAY_ENVIRONMENT=sandbox`、`ALIPAY_APP_ID`、`ALIPAY_SELLER_ID`，以及 `ALIPAY_PRIVATE_KEY_FILE` 和 `ALIPAY_PUBLIC_KEY_FILE`。两个文件分别保存应用私钥与支付宝公钥；也支持 `ALIPAY_PRIVATE_KEY`、`ALIPAY_PUBLIC_KEY` 直接配置。私钥不要发到聊天或提交仓库。相对密钥文件路径按所选配置文件目录解析。

从后端目录执行：

```sh
node -- scripts/check-alipay-sandbox.js
node -- scripts/check-alipay-sandbox.js --env-file /absolute/path/to/private-sandbox.env
node -- scripts/check-alipay-sandbox.js --env-file /absolute/path/to/private-sandbox.env --transaction EXISTING_SANDBOX_OUT_TRADE_NO
```

`node` 后的 `--` 必须保留：它阻止新版 Node 把脚本的 `--env-file` 当作运行时选项提前加载。脚本也会拒绝检测到的 Node 环境文件预加载调用。

不传 `--transaction` 时，脚本生成随机 `ASPROBE...` 商户订单号并查询，预期收到经过支付宝公钥验签的 `ACQ.TRADE_NOT_EXIST`。这证明网关请求和响应验签链路可用：输出 `gatewayVerified:true`、`orderFound:false`、`paymentVerified:false`，不代表支付成功。传入已有沙箱商户订单号也只做读取，仅输出安全的交易状态，不打印订单号或用户信息；`paymentVerified` 仍为 `false`，因为此检查不做本站订单归属、金额和会员到账验收。

该只读查询允许暂缺 `ALIPAY_NOTIFY_URL`；真正生成可支付订单仍要求完整 HTTPS 回调配置。脚本拒绝生产环境，缺配置仅显示字段名和有无，异常仅输出固定安全错误码，不输出原始错误、密钥、请求或响应载荷。退出码 `0` 为网关验签查询通过，`2` 为参数或配置尚未就绪，`1` 为网关检查未通过。

## Apple 接入预留

Apple 后续独立 provider 负责 App Store Server API 和交易/通知 JWS 验证，复用用户权益查询与交易幂等原则。需要 App Store Connect 商品、应用 Bundle ID、环境、App ID、合适权限的 API 密钥和 issuer ID、通知地址。iOS 购买使用服务端绑定的 `appAccountToken`；禁止用 Apple 登录 identityToken 代替购买证明。

Apple 的续订、宽限期、计费重试、取消续订、退款和恢复购买状态具有独立语义，不应映射成支付宝自动续费，也不应直接复用支付宝订单号规则。

## 验证边界

`tests/integration/payment.integration.test.js` 启动临时 MongoDB 和真实 `127.0.0.1` 动态端口 HTTP 服务，使用明确的支付宝 provider 替身。覆盖认证、建单定价、幂等、越权、到账确认、重复通知、退款和失败恢复。它验证后端业务处理，不证明实际 RSA2 验签、支付宝 SDK 扣款或真实商户回调已经通过。

上线还需要分别记录：官方签名/provider 测试、真实沙盒建单与支付、公开 HTTPS 回调、真实退款/查询、目标 App 发行规则验收。不得以替身测试、`/health` 或数据库可用替代真实支付完成证据。

2026-09-10 本地执行 `npm run test:integration -- --runTestsByPath tests/integration/payment.integration.test.js`：22 项通过（9.463 秒），包含注销去身份关联、退款漏通知后的查单、验证缓存过期时失败保护和环境隔离。上述测试包含动态端口 HTTP、临时 MongoDB 和 provider 替身，未调用真实支付宝网关或完成付款。
