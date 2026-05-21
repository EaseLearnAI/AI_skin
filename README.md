# AI_skin

AI_skin 是一个前后端分离的 AI 护肤项目，当前仓库把后端 Express API 和前端 Vue 应用放在同一个 GitHub 项目中统一维护。

## 项目结构

```text
AI_skin/
├── backend/     # Express + MongoDB API
├── frontend/    # Vue CLI frontend
├── scripts/     # local helper scripts
├── package.json # root-level commands
└── README.md
```

## 本地环境

- Node.js 18+
- npm
- MongoDB，本地默认地址: `mongodb://localhost:27017/aiskin`

## 安装依赖

```bash
npm run install:all
```

## 环境变量

复制示例文件后再填入真实密钥:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

后端开发库默认使用 `aiskin`，自动化测试会使用 `aiskin_test`，避免测试清空开发数据。

### 密钥和占位符

仓库里只允许出现占位符，不允许提交真实密钥。当前约定如下:

| 变量 | 放在哪里 | 说明 |
| --- | --- | --- |
| `API_KEY` | `backend/.env` | 阿里云百炼/通义千问兼容接口 Key。仓库中使用 `your_dashscope_api_key` 占位。 |
| `OSS_ACCESS_KEY_ID` | `backend/.env` | 阿里云 OSS Access Key ID。仓库中使用空值或 `your-oss-access-key-id` 占位。 |
| `OSS_ACCESS_KEY_SECRET` | `backend/.env` | 阿里云 OSS Access Key Secret。仓库中使用空值或 `your-oss-access-key-secret` 占位。 |
| `JWT_SECRET` | `backend/.env` | JWT 签名密钥。仓库中使用 `change_this_to_a_secure_random_value` 占位。 |

`backend/.env` 和 `frontend/.env.local` 已被 `.gitignore` 排除，只能留在本地或部署平台的环境变量配置中。不要把真实值写入 README、issue、commit message 或聊天记录。

如果真实密钥曾经出现在文档或提交历史里，请在阿里云控制台轮换新的 `API_KEY` 和 OSS Secret 后再继续使用。

## 启动项目

分别打开两个终端:

```bash
npm run dev:backend
```

```bash
npm run dev:frontend
```

默认地址:

- Backend: http://localhost:5000
- Frontend: http://localhost:8080

也可以使用脚本同时启动:

```bash
./scripts/dev.sh
```

## 验证

```bash
npm run check
```

这个命令会运行后端测试并构建前端。

## 注意事项

- 不要提交 `.env`、真实 API key、OSS 密钥。
- 不要提交 `node_modules/`、`dist/`、上传图片和日志。
- `backend/uploads/` 只保留目录占位，真实用户上传内容不进入仓库。
