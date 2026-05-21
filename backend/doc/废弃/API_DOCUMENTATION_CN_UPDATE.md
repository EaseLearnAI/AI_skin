# AI护肤系统API文档补充 - 成分分析功能

本文档是对现有API文档的补充，详细说明了新增的成分分析相关API的使用方法和接口规范。

## 成分分析相关API

### 分析产品成分

使用通义千问AI模型分析产品成分，生成详细的安全性和功效评估。

- **URL**: `/api/products/:id/analyze-ingredients`
- **方法**: `POST`
- **认证要求**: 必须
- **请求体**: 空

- **成功响应**:
  - **状态码**: 200 OK
  - **响应内容**:

```json
{
  "success": true,
  "message": "产品成分分析成功",
  "data": {
    "ingredientAnalysis": {
      "safetyIndex": 85,
      "efficacyScore": 4.2,
      "activeIngredients": 8,
      "acneRisk": {"level": "低", "percentage": 15},
      "irritationRisk": {"level": "低", "percentage": 20},
      "allergyRisk": {"level": "低", "percentage": 25},
      "efficacyAnalysis": [
        "主要功效为保湿补水，有效滋润肌肤",
        "含有多种抗氧化成分，具有抗老化功效",
        "添加舒缓成分，能够镇静肌肤"
      ],
      "potentialRisks": [
        "含有香精成分，敏感肌肤可能产生刺激",
        "部分防腐剂可能引起过敏反应"
      ],
      "recommendations": [
        "建议敏感肌肤先进行局部测试",
        "适合干性和中性肌肤使用",
        "建议早晚各使用一次，效果更好"
      ],
      "overallRating": 4.0,
      "summary": "整体来说是一款性价比较高的基础保湿产品，成分相对温和，适合大多数肌肤类型使用。敏感肌需谨慎使用。"
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
  "message": "产品没有成分列表，请先提取产品成分"
}
```

或

```json
{
  "success": false,
  "message": "分析产品成分失败",
  "error": "错误详情"
}
```

### 获取成分分析结果

获取已分析产品的成分分析结果，包含产品信息和详细分析。

- **URL**: `/api/products/:id/ingredient-analysis`
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
      "name": "保湿面霜",
      "imageUrl": "https://example.com/image.jpg",
      "ingredients": ["水", "甘油", "丁二醇", "..."]
    },
    "ingredientAnalysis": {
      "safetyIndex": 85,
      "efficacyScore": 4.2,
      "activeIngredients": 8,
      "acneRisk": {"level": "低", "percentage": 15},
      "irritationRisk": {"level": "低", "percentage": 20},
      "allergyRisk": {"level": "低", "percentage": 25},
      "efficacyAnalysis": [
        "主要功效为保湿补水，有效滋润肌肤",
        "含有多种抗氧化成分，具有抗老化功效",
        "添加舒缓成分，能够镇静肌肤"
      ],
      "potentialRisks": [
        "含有香精成分，敏感肌肤可能产生刺激",
        "部分防腐剂可能引起过敏反应"
      ],
      "recommendations": [
        "建议敏感肌肤先进行局部测试",
        "适合干性和中性肌肤使用",
        "建议早晚各使用一次，效果更好"
      ],
      "overallRating": 4.0,
      "summary": "整体来说是一款性价比较高的基础保湿产品，成分相对温和，适合大多数肌肤类型使用。敏感肌需谨慎使用。"
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
  "message": "该产品尚未进行成分分析，请先分析成分"
}
```

## 成分分析的数据模型

成分分析结果使用以下数据结构：

```json
{
  "safetyIndex": "数值(0-100), 表示产品的安全性指数",
  "efficacyScore": "数值(0-5.0), 表示产品的功效评分",
  "activeIngredients": "数值, 表示产品中活性成分的数量",
  "acneRisk": {
    "level": "字符串(低/中/高), 表示致痘风险等级",
    "percentage": "数值(0-100), 表示致痘风险百分比"
  },
  "irritationRisk": {
    "level": "字符串(低/中/高), 表示刺激风险等级",
    "percentage": "数值(0-100), 表示刺激风险百分比"
  },
  "allergyRisk": {
    "level": "字符串(低/中/高), 表示过敏风险等级",
    "percentage": "数值(0-100), 表示过敏风险百分比"
  },
  "efficacyAnalysis": [
    "字符串, 表示产品主要功效分析",
    "字符串, 表示产品主要功效分析",
    "字符串, 表示产品主要功效分析"
  ],
  "potentialRisks": [
    "字符串, 表示产品潜在风险",
    "字符串, 表示产品潜在风险"
  ],
  "recommendations": [
    "字符串, 表示产品使用建议",
    "字符串, 表示产品使用建议",
    "字符串, 表示产品使用建议"
  ],
  "overallRating": "数值(0-5.0), 表示AI综合评分",
  "summary": "字符串, 表示产品总体评价"
}
```

## 使用示例

以下是一个完整的成分分析流程：

1. 创建产品
2. 上传产品图片
3. 提取产品成分
4. 分析产品成分
5. 获取成分分析结果

示例cURL命令：

```bash
# 1. 登录（获取token）
curl -X POST http://localhost:5000/api/users/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password123"}'

# 2. 分析产品成分（替换YOUR_TOKEN和PRODUCT_ID）
curl -X POST http://localhost:5000/api/products/PRODUCT_ID/analyze-ingredients \
  -H "Authorization: Bearer YOUR_TOKEN"

# 3. 获取成分分析结果（替换YOUR_TOKEN和PRODUCT_ID）
curl -X GET http://localhost:5000/api/products/PRODUCT_ID/ingredient-analysis \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## 前端集成

前端可以直接使用成分分析结果渲染页面，分析结果的格式与前端展示需求保持一致，包括：

- 安全性指数、功效评分和活性成分数量用于显示在卡片中
- 风险等级和百分比用于显示在进度条中
- 功效分析、潜在风险和使用建议可直接用于展示对应的列表
- 综合评分和总结评价用于最终的产品评估展示

前端可以根据这些数据轻松构建ingredient_analysis.html页面中的所有UI组件。 