# 环境变量配置说明

## 问题解决方案

### 1. OSS配置错误修复
原问题：`Error: require accessKeyId, accessKeySecret`

**解决方案**：
- 修改了 `utils/ossUtils.js`，添加了环境变量检查
- 如果OSS配置不完整，系统会自动降级到本地存储
- 不会再因为缺少OSS配置而无法启动

### 2. 邮箱登录改为手机登录
**后端修改**：
- `models/userModel.js`: email字段改为phone，添加手机号验证
- `controllers/userController.js`: 注册/登录逻辑使用phone
- 密码最小长度从8位改为6位

**前端修改**：
- `components/login/LoginForm.vue`: email输入改为phone输入
- `components/login/RegisterForm.vue`: email输入改为phone输入
- `services/authService.js`: API调用参数从email改为phone

## 环境变量配置

### 创建 .env 文件
在 `backend/` 目录下创建 `.env` 文件。仓库只提交 `.env.example`，真实 `.env` 只保留在本地或部署平台：

```bash
# 数据库配置
MONGODB_URI=mongodb://localhost:27017/aiskin

# JWT配置
JWT_SECRET=change_this_to_a_secure_random_value
JWT_EXPIRES_IN=7d

# 服务器配置
PORT=5000
NODE_ENV=development

# API Key (阿里云百炼/通义千问)
API_KEY=your_dashscope_api_key

# 阿里云OSS配置 (可选，如果没有配置会自动降级到本地存储)
OSS_REGION=oss-cn-beijing
OSS_ACCESS_KEY_ID=your-oss-access-key-id
OSS_ACCESS_KEY_SECRET=your-oss-access-key-secret
OSS_BUCKET=abc1567849
OSS_AUTHORIZATION_V4=true
```

### 密钥安全

- 上面的 `API_KEY`、`OSS_ACCESS_KEY_ID`、`OSS_ACCESS_KEY_SECRET`、`JWT_SECRET` 都是占位符。
- 真实值只能写入本地 `backend/.env`，不要提交到 GitHub。
- 如果真实 key 曾经出现在文档、提交历史或聊天记录中，应当在阿里云控制台轮换后再使用。

### 配置说明

1. **MONGODB_URI**: MongoDB数据库连接地址
2. **JWT_SECRET**: JWT令牌签名密钥，请使用强密码
3. **API_KEY**: 阿里云通义千问的API密钥
4. **OSS配置**: 阿里云对象存储配置（可选）
   - 如果不配置OSS，系统会自动使用本地存储
   - 图片会保存在 `uploads/` 目录下

## 启动步骤

### 1. 后端启动
```bash
cd backend
npm install
npm start
```

### 2. 前端启动
```bash
cd frontend
npm install
npm run serve
```

## 注意事项

1. **手机号格式**: 必须是11位中国手机号，以1开头
2. **密码要求**: 最少6个字符
3. **OSS配置**: 如果不需要云存储，可以不配置OSS相关环境变量
4. **API_KEY**: 确保阿里云API密钥有效且有足够的调用额度

## 测试建议

1. 先使用手机号注册一个新账户
2. 测试登录功能
3. 测试皮肤分析功能（会自动处理图片存储）
4. 检查所有功能是否正常

## 故障排除

### 如果仍然出现OSS错误：
1. 检查 `.env` 文件是否在正确位置
2. 重启后端服务
3. 查看控制台日志确认配置状态

### 如果手机号验证失败：
1. 确认手机号格式正确（11位，以1开头）
2. 检查前端表单验证逻辑

### 如果登录失败：
1. 确认用户使用手机号而不是邮箱登录
2. 检查数据库中用户数据的字段名是否正确 
