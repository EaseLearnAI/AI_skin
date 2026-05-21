# 皮肤分析API文档

## 概述

皮肤分析功能通过集成阿里云qwen2.5-vl-72b-instruct视觉AI模型，为用户提供专业的面部皮肤状态分析服务。用户可以上传面部照片，系统会自动分析皮肤类型、黑头、痘痘、毛孔粗大等问题，并生成详细的分析报告和护肤建议。

## 技术栈

- **AI模型**: 阿里云通义千问qwen2.5-vl-72b-instruct (视觉理解模型)
- **图片存储**: 阿里云OSS对象存储
- **数据库**: MongoDB (新增skinanalyses集合)
- **图片处理**: Multer文件上传中间件
- **响应格式**: 标准JSON输出，快速响应

## 模型特性

- **快速响应**: 相比之前的qvq-plus模型，qwen2.5-vl-72b-instruct提供更快的分析速度
- **JSON格式**: 直接输出结构化JSON数据，无需额外解析
- **高精度**: 72B参数的大型视觉理解模型，提供专业级分析结果
- **无思考模式**: 直接输出最终结果，减少等待时间

## 基础URL

```
http://localhost:5000/api/skin-analysis
```

## 认证方式

所有API端点都需要JWT令牌认证。在请求头中包含令牌：

```
Authorization: Bearer YOUR_JWT_TOKEN
```

## API端点

### 1. 上传并分析皮肤状态

上传面部图片并进行AI皮肤状态分析。

- **URL**: `/analyze`
- **方法**: `POST`
- **认证要求**: 必须
- **Content-Type**: `multipart/form-data`
- **表单字段**:
  - `faceImage`: 面部图片文件（支持jpg、jpeg、png、gif格式，最大10MB）

#### 请求示例

```bash
curl -X POST \
  http://localhost:5000/api/skin-analysis/analyze \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  -F 'faceImage=@face.jpg'
```

#### 成功响应

- **状态码**: 201 Created
- **响应内容**:

```json
{
  "success": true,
  "message": "皮肤状态分析完成",
  "data": {
    "analysisId": "分析记录ID",
    "imageUrl": "https://abc1567849.oss-cn-beijing.aliyuncs.com/1234567890-face.jpg",
    "skinType": {
      "type": "混合性皮肤",
      "subtype": "混油性",
      "basis": "T区（额头、鼻子、下巴）呈现明显的油光和较大毛孔，而脸颊区域相对干燥，纹理较细腻"
    },
    "blackheads": {
      "exists": true,
      "severity": "中度",
      "distribution": ["鼻头", "鼻翼", "下巴"]
    },
    "acne": {
      "exists": true,
      "count": "少量",
      "types": ["粉刺", "丘疹"],
      "activity": "轻度活跃",
      "distribution": ["额头", "下巴"]
    },
    "pores": {
      "enlarged": true,
      "severity": "中度",
      "distribution": ["T区"]
    },
    "otherIssues": {
      "redness": {
        "exists": false,
        "severity": "",
        "distribution": []
      },
      "hyperpigmentation": {
        "exists": true,
        "types": ["痘印"],
        "distribution": ["脸颊"]
      },
      "fineLines": {
        "exists": false,
        "severity": "",
        "distribution": []
      },
      "sensitivity": {
        "exists": false,
        "signs": []
      },
      "skinToneEvenness": {
        "score": 7,
        "description": "肤色整体较为均匀，局部有轻微色素沉着"
      }
    },
    "overallAssessment": {
      "healthScore": 72,
      "summary": "整体皮肤状态良好，属于典型的混合性皮肤，需要针对不同区域进行差异化护理。T区控油保湿并重，脸颊区域重点保湿。",
      "recommendations": [
        "建议使用控油保湿的洁面产品，重点清洁T区",
        "选择轻薄型保湿产品，避免过度滋润造成T区负担",
        "定期使用去黑头产品，但要注意温和性",
        "对于痘印可以考虑使用含有烟酰胺的护肤品"
      ],
      "skinCondition": "良好"
    },
    "analysisConfig": {
      "model": "qwen2.5-vl-72b-instruct",
      "analysisDate": "2025-01-15T10:30:00.000Z",
      "processingTime": 15642
    }
  }
}
```

#### 错误响应

- **状态码**: 400 Bad Request

```json
{
  "success": false,
  "message": "请上传面部图片"
}
```

- **状态码**: 500 Internal Server Error

```json
{
  "success": false,
  "message": "AI分析失败: 网络连接超时"
}
```

### 2. 获取用户皮肤分析历史记录

获取当前用户的所有皮肤分析记录。

- **URL**: `/`
- **方法**: `GET`
- **认证要求**: 必须
- **查询参数**:
  - `page`: 页码，默认为1
  - `limit`: 每页数量，默认为10

#### 请求示例

```bash
curl -X GET \
  'http://localhost:5000/api/skin-analysis?page=1&limit=5' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN'
```

#### 成功响应

- **状态码**: 200 OK
- **响应内容**:

```json
{
  "success": true,
  "data": {
    "analyses": [
      {
        "_id": "分析记录ID1",
        "imageUrl": "图片URL",
        "imageName": "face.jpg",
        "skinType": {
          "type": "混合性皮肤",
          "subtype": "混油性",
          "basis": "判断依据..."
        },
        "blackheads": {
          "exists": true,
          "severity": "中度",
          "distribution": ["鼻头", "鼻翼"]
        },
        "acne": {
          "exists": true,
          "count": "少量",
          "types": ["粉刺"],
          "activity": "轻度活跃",
          "distribution": ["额头"]
        },
        "pores": {
          "enlarged": true,
          "severity": "中度",
          "distribution": ["T区"]
        },
        "otherIssues": {
          "redness": { "exists": false },
          "hyperpigmentation": { "exists": true, "types": ["痘印"] },
          "fineLines": { "exists": false },
          "sensitivity": { "exists": false },
          "skinToneEvenness": { "score": 7 }
        },
        "overallAssessment": {
          "healthScore": 72,
          "summary": "整体分析总结...",
          "recommendations": ["建议1", "建议2"],
          "skinCondition": "良好"
        },
        "analysisConfig": {
          "model": "qwen2.5-vl-72b-instruct",
          "analysisDate": "2025-01-15T10:30:00.000Z",
          "processingTime": 15642
        },
        "createdAt": "2025-01-15T10:30:00.000Z",
        "updatedAt": "2025-01-15T10:30:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 5,
      "total": 12,
      "pages": 3
    }
  }
}
```

### 3. 获取单个皮肤分析详情

获取指定分析记录的详细信息。

- **URL**: `/:id`
- **方法**: `GET`
- **认证要求**: 必须
- **路径参数**:
  - `id`: 分析记录ID

#### 请求示例

```bash
curl -X GET \
  http://localhost:5000/api/skin-analysis/67892f1e5d4c2a1b3e5f7890 \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN'
```

#### 成功响应

- **状态码**: 200 OK
- **响应内容**:

```json
{
  "success": true,
  "data": {
    "analysis": {
      "_id": "分析记录ID",
      "imageUrl": "图片URL",
      "imageName": "face.jpg",
      "skinType": {
        "type": "混合性皮肤",
        "subtype": "混油性",
        "basis": "详细判断依据..."
      },
      "blackheads": {
        "exists": true,
        "severity": "中度",
        "distribution": ["鼻头", "鼻翼", "下巴"]
      },
      "acne": {
        "exists": true,
        "count": "少量",
        "types": ["粉刺", "丘疹"],
        "activity": "轻度活跃",
        "distribution": ["额头", "下巴"]
      },
      "pores": {
        "enlarged": true,
        "severity": "中度",
        "distribution": ["T区"]
      },
      "otherIssues": {
        "redness": {
          "exists": false,
          "severity": "",
          "distribution": []
        },
        "hyperpigmentation": {
          "exists": true,
          "types": ["痘印"],
          "distribution": ["脸颊"]
        },
        "fineLines": {
          "exists": false,
          "severity": "",
          "distribution": []
        },
        "sensitivity": {
          "exists": false,
          "signs": []
        },
        "skinToneEvenness": {
          "score": 7,
          "description": "肤色整体较为均匀"
        }
      },
      "overallAssessment": {
        "healthScore": 72,
        "summary": "详细的分析总结...",
        "recommendations": [
          "建议使用控油保湿的洁面产品",
          "选择轻薄型保湿产品",
          "定期使用去黑头产品",
          "可以考虑使用含有烟酰胺的护肤品"
        ],
        "skinCondition": "良好"
      },
      "rawAnalysisResult": "AI模型原始输出结果...",
      "analysisConfig": {
        "model": "qwen2.5-vl-72b-instruct",
        "analysisDate": "2025-01-15T10:30:00.000Z",
        "processingTime": 15642
      },
      "createdBy": {
        "_id": "用户ID",
        "name": "用户名",
        "email": "user@example.com"
      },
      "createdAt": "2025-01-15T10:30:00.000Z",
      "updatedAt": "2025-01-15T10:30:00.000Z"
    }
  }
}
```

#### 错误响应

- **状态码**: 404 Not Found

```json
{
  "success": false,
  "message": "未找到该分析记录"
}
```

### 4. 获取用户皮肤分析统计数据

获取当前用户的皮肤分析统计信息。

- **URL**: `/stats`
- **方法**: `GET`
- **认证要求**: 必须

#### 请求示例

```bash
curl -X GET \
  http://localhost:5000/api/skin-analysis/stats \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN'
```

#### 成功响应

- **状态码**: 200 OK
- **响应内容**:

```json
{
  "success": true,
  "data": {
    "stats": {
      "totalAnalyses": 5,
      "latestAnalysisDate": "2025-01-15T10:30:00.000Z",
      "averageHealthScore": 74,
      "skinTypeDistribution": [
        { "_id": "混合性皮肤", "count": 3 },
        { "_id": "油性皮肤", "count": 2 }
      ],
      "healthScoreTrend": [
        {
          "overallAssessment": { "healthScore": 68 },
          "createdAt": "2025-01-10T10:30:00.000Z"
        },
        {
          "overallAssessment": { "healthScore": 72 },
          "createdAt": "2025-01-12T10:30:00.000Z"
        },
        {
          "overallAssessment": { "healthScore": 75 },
          "createdAt": "2025-01-15T10:30:00.000Z"
        }
      ],
      "latestSkinCondition": "良好"
    }
  }
}
```

### 5. 删除皮肤分析记录

删除指定的皮肤分析记录。

- **URL**: `/:id`
- **方法**: `DELETE`
- **认证要求**: 必须
- **路径参数**:
  - `id`: 分析记录ID

#### 请求示例

```bash
curl -X DELETE \
  http://localhost:5000/api/skin-analysis/67892f1e5d4c2a1b3e5f7890 \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN'
```

#### 成功响应

- **状态码**: 200 OK
- **响应内容**:

```json
{
  "success": true,
  "message": "分析记录删除成功",
  "data": {}
}
```

#### 错误响应

- **状态码**: 404 Not Found

```json
{
  "success": false,
  "message": "未找到该分析记录"
}
```

## 数据模型

### 皮肤分析记录模型 (SkinAnalysis)

```javascript
{
  // 关联用户
  createdBy: ObjectId, // 用户ID
  
  // 原始图片信息
  imageUrl: String,    // 图片URL
  imageName: String,   // 原始文件名
  
  // 皮肤类型分析
  skinType: {
    type: String,      // 油性皮肤|干性皮肤|中性皮肤|混合性皮肤
    subtype: String,   // 混油性|混干性|正常
    basis: String      // 判断依据
  },
  
  // 黑头情况
  blackheads: {
    exists: Boolean,   // 是否存在黑头
    severity: String,  // 无|少量|中度|大量
    distribution: [String] // 分布区域
  },
  
  // 痘痘情况
  acne: {
    exists: Boolean,   // 是否存在痘痘
    count: String,     // 无|少量|中度|大量
    types: [String],   // 痘痘类型
    activity: String,  // 不活跃|轻度活跃|中度活跃|高度活跃
    distribution: [String] // 分布区域
  },
  
  // 毛孔粗大情况
  pores: {
    enlarged: Boolean, // 是否毛孔粗大
    severity: String,  // 正常|轻度|中度|严重
    distribution: [String] // 分布区域
  },
  
  // 其他皮肤问题
  otherIssues: {
    redness: {         // 泛红情况
      exists: Boolean,
      severity: String,
      distribution: [String]
    },
    hyperpigmentation: { // 色素沉着
      exists: Boolean,
      types: [String],
      distribution: [String]
    },
    fineLines: {       // 细纹
      exists: Boolean,
      severity: String,
      distribution: [String]
    },
    sensitivity: {     // 敏感性
      exists: Boolean,
      signs: [String]
    },
    skinToneEvenness: { // 肤色均匀度
      score: Number,   // 1-10分
      description: String
    }
  },
  
  // 整体评估
  overallAssessment: {
    healthScore: Number,    // 0-100健康评分
    summary: String,        // 总结
    recommendations: [String], // 建议
    skinCondition: String   // 优秀|良好|一般|需要改善|需要专业护理
  },
  
  // AI分析原始结果
  rawAnalysisResult: String,
  
  // 分析参数
  analysisConfig: {
    model: String,          // qwen2.5-vl-72b-instruct
    analysisDate: Date,     // 分析时间
    processingTime: Number  // 处理时间(ms)
  },
  
  // 时间戳
  createdAt: Date,
  updatedAt: Date
}
```

## 错误代码说明

| 状态码 | 错误类型 | 说明 |
|--------|----------|------|
| 400 | Bad Request | 请求参数错误或文件格式不正确 |
| 401 | Unauthorized | 未提供认证令牌或令牌无效 |
| 404 | Not Found | 请求的资源不存在 |
| 500 | Internal Server Error | 服务器内部错误，如AI分析失败、OSS上传失败等 |

## 分析流程说明

1. **图片上传**: 用户上传面部图片，系统进行格式和大小验证
2. **OSS存储**: 图片上传到阿里云OSS，获得永久访问URL
3. **AI分析**: 调用qwen2.5-vl-72b-instruct模型进行流式皮肤状态分析
4. **结果解析**: 解析AI返回的JSON格式分析结果
5. **数据存储**: 将分析结果保存到MongoDB数据库
6. **响应返回**: 向用户返回完整的分析结果

## 注意事项

1. **图片要求**:
   - 支持格式：jpg、jpeg、png、gif
   - 最大大小：10MB
   - 建议分辨率：1024x1024以上
   - 图片内容：清晰的面部照片

2. **AI分析时间**:
   - 分析过程可能需要15-60秒
   - 支持流式输出，可实时查看分析进度
   - 超时时间设置为2分钟

3. **数据安全**:
   - 所有图片都存储在阿里云OSS
   - 分析记录与用户账号绑定
   - 支持删除不需要的分析记录

4. **API限制**:
   - 需要有效的JWT认证令牌
   - 用户只能访问自己的分析记录
   - 建议合理控制分析频率

## 使用示例

### JavaScript (Node.js)

```javascript
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

// 上传并分析皮肤
async function analyzeSkin(imagePath, token) {
  const formData = new FormData();
  formData.append('faceImage', fs.createReadStream(imagePath));
  
  try {
    const response = await axios.post(
      'http://localhost:5000/api/skin-analysis/analyze',
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          'Authorization': `Bearer ${token}`
        }
      }
    );
    
    console.log('分析结果:', response.data);
    return response.data;
  } catch (error) {
    console.error('分析失败:', error.response?.data || error.message);
  }
}

// 获取分析历史
async function getAnalysisHistory(token) {
  try {
    const response = await axios.get(
      'http://localhost:5000/api/skin-analysis',
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );
    
    console.log('分析历史:', response.data);
    return response.data;
  } catch (error) {
    console.error('获取历史失败:', error.response?.data || error.message);
  }
}
```

### Python

```python
import requests

def analyze_skin(image_path, token):
    url = 'http://localhost:5000/api/skin-analysis/analyze'
    
    headers = {
        'Authorization': f'Bearer {token}'
    }
    
    with open(image_path, 'rb') as f:
        files = {'faceImage': f}
        response = requests.post(url, headers=headers, files=files)
    
    if response.status_code == 201:
        print('分析成功:', response.json())
        return response.json()
    else:
        print('分析失败:', response.json())
        return None

def get_analysis_history(token):
    url = 'http://localhost:5000/api/skin-analysis'
    
    headers = {
        'Authorization': f'Bearer {token}'
    }
    
    response = requests.get(url, headers=headers)
    
    if response.status_code == 200:
        print('获取历史成功:', response.json())
        return response.json()
    else:
        print('获取历史失败:', response.json())
        return None
```

## 更新日志

### v1.0.0 (2025-01-15)
- 初始版本发布
- 支持面部图片上传和AI分析
- 实现完整的CRUD操作
- 集成qwen2.5-vl-72b-instruct视觉理解模型
- 支持流式AI分析输出
- 完善的错误处理和日志记录 