# AI护肤系统API文档

本文档详细说明了AI护肤系统后端API的使用方法和接口规范。

## 基础URL

```
http://localhost:5000/api
```

## 认证方式

大多数API端点需要通过JWT令牌进行身份验证。在请求头中包含令牌：

```
Authorization: Bearer YOUR_JWT_TOKEN
```

## API端点

### 用户管理

#### 用户注册

创建新用户账号。

- **URL**: `/users/register`
- **方法**: `POST`
- **认证要求**: 无
- **请求体**:

```json
{
  "name": "张三",
  "email": "zhangsan@example.com",
  "password": "password123"
}
```

- **成功响应**:
  - **状态码**: 201 Created
  - **响应内容**:

```json
{
  "success": true,
  "message": "用户注册成功",
  "token": "JWT_TOKEN",
  "data": {
    "user": {
      "_id": "用户ID",
      "name": "张三",
      "email": "zhangsan@example.com",
      "createdAt": "2023-10-01T12:00:00.000Z",
      "updatedAt": "2023-10-01T12:00:00.000Z"
    }
  }
}
```

- **错误响应**:
  - **状态码**: 400 Bad Request
  - **响应内容**:

```json
{
  "success": false,
  "message": "请提供姓名、邮箱和密码"
}
```

或

```json
{
  "success": false,
  "message": "此邮箱已被注册"
}
```

#### 用户登录

验证用户身份并返回JWT令牌。

- **URL**: `/users/login`
- **方法**: `POST`
- **认证要求**: 无
- **请求体**:

```json
{
  "email": "zhangsan@example.com",
  "password": "password123"
}
```

- **成功响应**:
  - **状态码**: 200 OK
  - **响应内容**:

```json
{
  "success": true,
  "message": "登录成功",
  "token": "JWT_TOKEN",
  "data": {
    "user": {
      "_id": "用户ID",
      "name": "张三",
      "email": "zhangsan@example.com",
      "createdAt": "2023-10-01T12:00:00.000Z",
      "updatedAt": "2023-10-01T12:00:00.000Z"
    }
  }
}
```

- **错误响应**:
  - **状态码**: 401 Unauthorized
  - **响应内容**:

```json
{
  "success": false,
  "message": "邮箱或密码不正确"
}
```

或

```json
{
  "success": false,
  "message": "请提供邮箱和密码"
}
```

#### 获取当前用户信息

获取当前已认证用户的个人资料。

- **URL**: `/users/me`
- **方法**: `GET`
- **认证要求**: 必须
- **成功响应**:
  - **状态码**: 200 OK
  - **响应内容**:

```json
{
  "success": true,
  "data": {
    "user": {
      "_id": "用户ID",
      "name": "张三",
      "email": "zhangsan@example.com",
      "createdAt": "2023-10-01T12:00:00.000Z",
      "updatedAt": "2023-10-01T12:00:00.000Z"
    }
  }
}
```

- **错误响应**:
  - **状态码**: 401 Unauthorized
  - **响应内容**:

```json
{
  "success": false,
  "message": "您尚未登录，请登录后访问此资源"
}
```

### 产品管理

#### 创建产品

创建新的护肤产品记录。

- **URL**: `/products`
- **方法**: `POST`
- **认证要求**: 必须
- **请求体**:

```json
{
  "name": "美白精华液",
  "description": "这是一款美白精华产品"
}
```

- **成功响应**:
  - **状态码**: 201 Created
  - **响应内容**:

```json
{
  "success": true,
  "message": "产品创建成功",
  "data": {
    "product": {
      "_id": "产品ID",
      "name": "美白精华液",
      "description": "这是一款美白精华产品",
      "imageUrl": "",
      "ingredients": [],
      "createdBy": "用户ID",
      "createdAt": "2023-10-01T12:00:00.000Z",
      "updatedAt": "2023-10-01T12:00:00.000Z"
    }
  }
}
```

- **错误响应**:
  - **状态码**: 400 Bad Request
  - **响应内容**:

```json
{
  "success": false,
  "message": "请提供产品名称"
}
```

#### 上传产品图片

为已创建的产品上传图片。

- **URL**: `/products/:id/upload-image`
- **方法**: `POST`
- **认证要求**: 必须
- **Content-Type**: `multipart/form-data`
- **表单字段**:
  - `productImage`: 产品图片文件（支持jpg、jpeg、png、gif格式，最大5MB）

- **成功响应**:
  - **状态码**: 200 OK
  - **响应内容**:

```json
{
  "success": true,
  "message": "产品图片上传成功",
  "data": {
    "imageUrl": "https://abc1567849.oss-cn-beijing.aliyuncs.com/1234567890-product.jpg"
  }
}
```

- **错误响应**:
  - **状态码**: 400 Bad Request
  - **响应内容**:

```json
{
  "success": false,
  "message": "请上传产品图片"
}
```

或

```json
{
  "success": false,
  "message": "只能上传图片文件 (jpg, jpeg, png, gif)"
}
```

或

```json
{
  "success": false,
  "message": "文件大小不能超过5MB"
}
```

#### 提取产品成分

使用OCR技术从产品图片中提取成分信息。

- **URL**: `/products/:id/extract-ingredients`
- **方法**: `POST`
- **认证要求**: 必须
- **请求体**: 空

- **成功响应**:
  - **状态码**: 200 OK
  - **响应内容**:

```json
{
  "success": true,
  "message": "产品成分提取成功",
  "data": {
    "ingredients": ["水", "甘油", "尿素", "透明质酸钠", "..."],
    "rawContent": "OCR原始识别文本"
  }
}
```

- **错误响应**:
  - **状态码**: 400 Bad Request
  - **响应内容**:

```json
{
  "success": false,
  "message": "产品没有图片，请先上传图片"
}
```

或

```json
{
  "success": false,
  "message": "成分提取失败",
  "error": "错误详情"
}
```

#### 获取产品列表

获取当前用户创建的所有产品列表。

- **URL**: `/products`
- **方法**: `GET`
- **认证要求**: 必须
- **查询参数**:
  - `page`: 页码，默认为1
  - `limit`: 每页数量，默认为10

- **成功响应**:
  - **状态码**: 200 OK
  - **响应内容**:

```json
{
  "success": true,
  "count": 2,
  "total": 2,
  "data": {
    "products": [
      {
        "_id": "产品ID1",
        "name": "美白精华液",
        "description": "这是一款美白精华产品",
        "imageUrl": "https://abc1567849.oss-cn-beijing.aliyuncs.com/1234567890-product1.jpg",
        "ingredients": ["水", "甘油", "尿素", "透明质酸钠", "..."],
        "createdBy": "用户ID",
        "createdAt": "2023-10-01T12:00:00.000Z",
        "updatedAt": "2023-10-01T12:00:00.000Z"
      },
      {
        "_id": "产品ID2",
        "name": "保湿面霜",
        "description": "这是一款保湿面霜",
        "imageUrl": "https://abc1567849.oss-cn-beijing.aliyuncs.com/1234567890-product2.jpg",
        "ingredients": ["水", "甘油", "..."],
        "createdBy": "用户ID",
        "createdAt": "2023-10-01T12:00:00.000Z",
        "updatedAt": "2023-10-01T12:00:00.000Z"
      }
    ]
  },
  "pagination": {
    "page": 1,
    "limit": 10,
    "pages": 1
  }
}
```

#### 获取单个产品

获取单个产品的详细信息。

- **URL**: `/products/:id`
- **方法**: `GET`
- **认证要求**: 必须

- **成功响应**:
  - **状态码**: 200 OK
  - **响应内容**:

```json
{
  "success": true,
  "data": {
    "product": {
      "_id": "产品ID",
      "name": "美白精华液",
      "description": "这是一款美白精华产品",
      "imageUrl": "https://abc1567849.oss-cn-beijing.aliyuncs.com/1234567890-product.jpg",
      "ingredients": ["水", "甘油", "尿素", "透明质酸钠", "..."],
      "createdBy": "用户ID",
      "createdAt": "2023-10-01T12:00:00.000Z",
      "updatedAt": "2023-10-01T12:00:00.000Z"
    }
  }
}
```

- **错误响应**:
  - **状态码**: 404 Not Found
  - **响应内容**:

```json
{
  "success": false,
  "message": "产品不存在"
}
```

#### 更新产品

更新产品信息。

- **URL**: `/products/:id`
- **方法**: `PUT`
- **认证要求**: 必须
- **请求体**:

```json
{
  "name": "更新后的美白精华液",
  "description": "这是更新后的美白精华产品描述"
}
```

- **成功响应**:
  - **状态码**: 200 OK
  - **响应内容**:

```json
{
  "success": true,
  "message": "产品更新成功",
  "data": {
    "product": {
      "_id": "产品ID",
      "name": "更新后的美白精华液",
      "description": "这是更新后的美白精华产品描述",
      "imageUrl": "https://abc1567849.oss-cn-beijing.aliyuncs.com/1234567890-product.jpg",
      "ingredients": ["水", "甘油", "尿素", "透明质酸钠", "..."],
      "createdBy": "用户ID",
      "createdAt": "2023-10-01T12:00:00.000Z",
      "updatedAt": "2023-10-01T12:00:00.000Z"
    }
  }
}
```

- **错误响应**:
  - **状态码**: 404 Not Found
  - **响应内容**:

```json
{
  "success": false,
  "message": "产品不存在"
}
```

或

```json
{
  "success": false,
  "message": "没有权限修改此产品"
}
```

#### 删除产品

删除产品。

- **URL**: `/products/:id`
- **方法**: `DELETE`
- **认证要求**: 必须

- **成功响应**:
  - **状态码**: 200 OK
  - **响应内容**:

```json
{
  "success": true,
  "message": "产品删除成功",
  "data": {}
}
```

- **错误响应**:
  - **状态码**: 404 Not Found
  - **响应内容**:

```json
{
  "success": false,
  "message": "产品不存在"
}
```

或

```json
{
  "success": false,
  "message": "没有权限删除此产品"
}
```

## 错误处理

API返回适当的HTTP状态码和统一格式的错误消息：

```json
{
  "success": false,
  "message": "描述出错原因的错误消息",
  "error": "详细错误信息（仅在开发环境中显示）"
}
```

## 状态码说明

- **200** - OK：请求成功
- **201** - Created：资源创建成功
- **400** - Bad Request：请求无效或参数验证失败
- **401** - Unauthorized：认证失败或用户未登录
- **403** - Forbidden：没有权限访问资源
- **404** - Not Found：资源不存在
- **500** - Internal Server Error：服务器内部错误

## 数据模型

### 用户模型

```json
{
  "_id": "MongoDB ObjectId",
  "name": "String（必需）",
  "email": "String（必需，唯一）",
  "password": "String（必需，至少8个字符，响应中不返回）",
  "createdAt": "Date",
  "updatedAt": "Date"
}
```

### 产品模型

```json
{
  "_id": "MongoDB ObjectId",
  "name": "String（必需）",
  "description": "String",
  "imageUrl": "String",
  "ingredients": "Array（成分列表）",
  "createdBy": "MongoDB ObjectId（关联用户ID）",
  "createdAt": "Date",
  "updatedAt": "Date"
}
```

## 测试API

您可以使用Postman或cURL等工具测试API端点。请按照以下步骤操作：

1. 首先使用注册端点创建用户
2. 使用登录端点获取JWT令牌
3. 在需要认证的端点请求头中包含令牌

示例cURL命令：

```bash
# 注册新用户
curl -X POST http://localhost:5000/api/users/register \
  -H "Content-Type: application/json" \
  -d '{"name":"测试用户","email":"test@example.com","password":"password123"}'

# 登录
curl -X POST http://localhost:5000/api/users/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'

# 创建产品（替换YOUR_TOKEN为登录返回的token）
curl -X POST http://localhost:5000/api/products \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"测试产品","description":"这是一个测试产品"}'

# 上传产品图片（替换YOUR_TOKEN和PRODUCT_ID）
curl -X POST http://localhost:5000/api/products/PRODUCT_ID/upload-image \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "productImage=@/path/to/image.jpg"

# 提取产品成分（替换YOUR_TOKEN和PRODUCT_ID）
curl -X POST http://localhost:5000/api/products/PRODUCT_ID/extract-ingredients \
  -H "Authorization: Bearer YOUR_TOKEN"
``` 