# AI Skin 生产 OSS 联调报告

测试日期：2026-08-25  
服务器：`lunzo.site`  
部署目录：`/home/ubuntu/AI_skin_backend`  
PM2 应用：`ai-skin-backend`

本文不记录 AccessKey、JWT、签名 URL、用户数据或 AI 原始输出。

## 配置变更

线上 `.env` 已切换到：

- Region：`oss-cn-beijing`
- Bucket：`aiskin-prod-private-20260824`
- Authorization V4：开启
- AccessKey：已配置，值不落入仓库和报告

变更只替换五个 OSS 键，保留 MongoDB、JWT、AI 等其他环境变量。

备份：

- `/home/ubuntu/AI_skin_backend/.env.backup-oss-2026-08-25T12-11-19-711Z`
- `/home/ubuntu/AI_skin_backend/controllers/planController.js.backup-json-mode-2026-08-25T12-19-11-711Z`

备份和 `.env` 权限均为 `600`。

## 真实 OSS 测试

| 检查项 | 结果 |
|---|---|
| SDK 上传 | HTTP 200 |
| SDK 下载内容校验 | 字节一致 |
| 未签名 URL | HTTP 403 |
| 签名 URL | HTTP 200 |
| 签名 URL 下载内容 | 字节一致 |
| 删除对象 | HTTP 204 |
| 删除后读取 | 404/NoSuchKey |

未签名 URL 返回 403、签名 URL 返回 200，证明当前 Bucket 和对象访问符合私有存储预期。

## 线上旧版 OSS Utility 测试

使用生产实际加载的 `utils/ossUtils.js` 验证：

- `uploadToOSS` 确认走 OSS，没有进入本地 fallback。
- `downloadFromOSS` 返回内容与上传内容一致。
- `getOSSFileUrl` 生成的签名 URL 可下载原文件。
- 测试对象删除成功。

## 生产接口真实链路

以下调用通过真实 PM2、Express、MongoDB、DashScope 和新 OSS 执行：

```text
手机号注册和登录
→ 创建两个产品
→ 上传两个产品包装图
→ 使用接口返回的签名 URL 下载原图
→ 真实 OCR
→ 真实成分分析
→ 真实冲突检测
→ 真实方案生成
→ 真实肌肤检测
→ 使用签名 URL 回传肌肤测试图
→ 历史、最新和统计查询
```

结果：

- 两个产品上传均返回 200，回传文件均为 742578 bytes。
- 两次 OCR 均返回非空成分数组。
- 成分分析返回 200。
- 冲突检测返回 201。
- 方案生成返回 201，morning/evening 均为 4 步。
- 肌肤检测返回 201，回传文件为 45364 bytes，健康评分字段存在。
- 肌肤历史、最新和统计均返回 200。

所有测试用户、MongoDB 测试数据和 OSS 测试对象已清理。

## 方案生成故障与修复

首次生产实测时，方案生成返回：`AI返回结果解析失败`。

根因：当前模型返回以 Markdown `json` fence 开头的内容，而线上旧控制器直接执行 `JSON.parse(content)`。

修复：在 DashScope chat completion 请求中加入：

```js
response_format: { type: 'json_object' }
```

使用同一模型的最小请求证明 JSON mode 返回不带 Markdown fence 的可解析 JSON；修改后真实方案接口复测通过。

本地重构后的 `createObjectStorageProvider` 也使用线上配置完成了独立真实验证：

- `faces/` 前缀私有上传成功。
- 签名 URL 下载内容逐字节一致。
- 删除后确认对象不存在。

## 当前生产遗留风险

线上 `/home/ubuntu/AI_skin_backend` 仍是旧版非 Git 部署，不是本地模块化重构版本。联调中确认两个遗留问题：

1. 旧版产品和肌肤记录删除接口只删 MongoDB 记录，不主动删除对应 OSS 对象。本次测试对象由测试脚本显式清理；本地重构版本已经实现对象删除。
2. 旧版 controller 会把请求头、签名 URL 和 AI 原始输出写入 PM2 日志。本次临时用户已经删除，但正式上线重构版本前应清理这些日志行为。

因此，本报告证明新 OSS 和当前业务上传/回传/AI 链路可用；不代表线上旧版本已经满足最终隐私与删除规则。最终上线仍应部署本地重构版本并再执行一次相同 production smoke。
