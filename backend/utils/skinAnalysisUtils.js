const OpenAI = require("openai");
const { VISION_MODEL } = require('../config/aiModels');
require('dotenv').config();

// 初始化 OpenAI 客户端，使用阿里云的兼容模式
const openai = new OpenAI({
  apiKey: process.env.API_KEY,
  baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1"
});

/**
 * 调用统一视觉模型分析皮肤状态
 * @param {string} imageUrl - 图片URL
 * @returns {Promise<Object>} - 分析结果
 */
const analyzeSkinCondition = async (imageUrl) => {
  console.log('🚀 开始皮肤状态分析...');
  console.log('📷 图片URL:', imageUrl);
  
  const startTime = Date.now();
  
  try {
    // 构建分析提示词
    const analysisPrompt = `
请详细分析这张面部照片中的皮肤状态，我需要专业的护肤分析报告。请按照以下格式严格返回JSON格式的分析结果：

{
  "skinType": {
    "type": "油性皮肤|干性皮肤|中性皮肤|混合性皮肤",
    "subtype": "混油性|混干性|正常",
    "basis": "详细说明判断依据，如T区或U区的光泽度、毛孔大小、皮肤纹理等"
  },
  "blackheads": {
    "exists": true|false,
    "severity": "无|少量|中度|大量",
    "distribution": ["T区", "鼻翼", "下巴等具体区域"]
  },
  "acne": {
    "exists": true|false,
    "count": "无|少量|中度|大量",
    "types": ["粉刺", "丘疹", "囊肿性痤疮等类型"],
    "activity": "不活跃|轻度活跃|中度活跃|高度活跃",
    "distribution": ["额头", "脸颊", "下巴等具体区域"]
  },
  "pores": {
    "enlarged": true|false,
    "severity": "正常|轻度|中度|严重",
    "distribution": ["T区", "脸颊等具体区域"]
  },
  "otherIssues": {
    "redness": {
      "exists": true|false,
      "severity": "轻度|中度|严重",
      "distribution": ["具体区域"]
    },
    "hyperpigmentation": {
      "exists": true|false,
      "types": ["晒斑", "痘印", "色素沉着等"],
      "distribution": ["具体区域"]
    },
    "fineLines": {
      "exists": true|false,
      "severity": "轻度|中度|严重",
      "distribution": ["眼部", "额头等区域"]
    },
    "sensitivity": {
      "exists": true|false,
      "signs": ["泛红", "干燥", "紧绷等迹象"]
    },
    "skinToneEvenness": {
      "score": 1-10,
      "description": "肤色均匀度描述"
    }
  },
  "overallAssessment": {
    "healthScore": 0-100,
    "summary": "整体皮肤健康状况总结",
    "recommendations": ["护肤建议1", "护肤建议2", "护肤建议3"],
    "skinCondition": "优秀|良好|一般|需要改善|需要专业护理"
  }
}

请仔细观察图片中的皮肤细节，提供专业、准确的分析结果。注意：请只返回JSON格式的数据，不要包含其他文字。
`;

    console.log(`🤖 发送请求到${VISION_MODEL}模型...`);
    
    // 使用非流式调用，获得快速JSON响应
    const response = await openai.chat.completions.create({
      model: VISION_MODEL,
      messages: [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { "url": imageUrl } },
            { type: "text", text: analysisPrompt }
          ]
        }
      ],
      max_tokens: 4096,
      temperature: 0.1, // 降低温度以获得更一致的结果
      response_format: { type: "json_object" } // 强制JSON格式输出
    });

    const processingTime = Date.now() - startTime;
    console.log('⏱️ 分析完成，耗时:', processingTime, 'ms');

    const content = response.choices[0].message.content;
    console.log('📄 原始响应内容:', content);

    // 解析JSON结果
    let analysisResult;
    try {
      analysisResult = JSON.parse(content);
      console.log('✅ JSON解析成功');
    } catch (parseError) {
      console.error('❌ JSON解析失败:', parseError.message);
      console.log('原始内容:', content);
      
      // 如果JSON解析失败，尝试从文本中提取信息
      analysisResult = extractAnalysisFromText(content);
    }

    // 验证结果完整性
    if (!validateAnalysisResult(analysisResult)) {
      console.warn('⚠️ 分析结果不完整，使用默认值补充');
      analysisResult = fillMissingFields(analysisResult);
    }

    return {
      success: true,
      data: analysisResult,
      rawContent: content,
      processingTime: processingTime
    };

  } catch (error) {
    console.error('❌ 皮肤分析失败:', error);
    return {
      success: false,
      error: error.message,
      processingTime: Date.now() - startTime
    };
  }
};

/**
 * 从文本中提取分析信息（当JSON解析失败时的后备方案）
 * @param {string} text - 原始文本
 * @returns {Object} - 提取的分析结果
 */
const extractAnalysisFromText = (text) => {
  console.log('🔄 尝试从文本提取分析信息...');
  
  // 默认结构
  const defaultResult = {
    skinType: {
      type: "中性皮肤",
      subtype: "正常",
      basis: "无法从文本中准确提取皮肤类型信息"
    },
    blackheads: {
      exists: false,
      severity: "无",
      distribution: []
    },
    acne: {
      exists: false,
      count: "无",
      types: [],
      activity: "不活跃",
      distribution: []
    },
    pores: {
      enlarged: false,
      severity: "正常",
      distribution: []
    },
    otherIssues: {
      redness: { exists: false, severity: "", distribution: [] },
      hyperpigmentation: { exists: false, types: [], distribution: [] },
      fineLines: { exists: false, severity: "", distribution: [] },
      sensitivity: { exists: false, signs: [] },
      skinToneEvenness: { score: 7, description: "肤色均匀度一般" }
    },
    overallAssessment: {
      healthScore: 70,
      summary: text.substring(0, 200) + "...", // 使用原始文本的前200字符
      recommendations: ["建议咨询专业皮肤科医生", "保持基础护肤", "定期观察皮肤变化"],
      skinCondition: "一般"
    }
  };

  // 尝试提取一些关键信息
  if (text.includes('油性') || text.includes('油光') || text.includes('T区出油')) {
    defaultResult.skinType.type = "油性皮肤";
  } else if (text.includes('干性') || text.includes('干燥') || text.includes('缺水')) {
    defaultResult.skinType.type = "干性皮肤";
  } else if (text.includes('混合') || text.includes('T区')) {
    defaultResult.skinType.type = "混合性皮肤";
  }

  if (text.includes('黑头') || text.includes('粉刺')) {
    defaultResult.blackheads.exists = true;
    defaultResult.blackheads.severity = "少量";
  }

  if (text.includes('痘痘') || text.includes('痤疮') || text.includes('青春痘')) {
    defaultResult.acne.exists = true;
    defaultResult.acne.count = "少量";
  }

  return defaultResult;
};

/**
 * 填充缺失字段
 * @param {Object} analysisResult - 分析结果
 * @returns {Object} - 补充后的分析结果
 */
const fillMissingFields = (analysisResult) => {
  const defaults = {
    skinType: {
      type: "中性皮肤",
      subtype: "正常",
      basis: "基于图像分析的综合判断"
    },
    blackheads: {
      exists: false,
      severity: "无",
      distribution: []
    },
    acne: {
      exists: false,
      count: "无",
      types: [],
      activity: "不活跃",
      distribution: []
    },
    pores: {
      enlarged: false,
      severity: "正常",
      distribution: []
    },
    otherIssues: {
      redness: { exists: false, severity: "", distribution: [] },
      hyperpigmentation: { exists: false, types: [], distribution: [] },
      fineLines: { exists: false, severity: "", distribution: [] },
      sensitivity: { exists: false, signs: [] },
      skinToneEvenness: { score: 7, description: "肤色均匀度一般" }
    },
    overallAssessment: {
      healthScore: 70,
      summary: "皮肤状态总体良好",
      recommendations: ["保持规律护肤", "注意防晒"],
      skinCondition: "一般"
    }
  };

  // 深度合并，填充缺失字段
  return mergeDeep(defaults, analysisResult || {});
};

/**
 * 深度合并对象
 */
const mergeDeep = (target, source) => {
  const result = { ...target };
  
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = mergeDeep(target[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  
  return result;
};

/**
 * 验证分析结果的完整性
 * @param {Object} analysisResult - 分析结果
 * @returns {boolean} - 是否有效
 */
const validateAnalysisResult = (analysisResult) => {
  if (!analysisResult || typeof analysisResult !== 'object') {
    return false;
  }

  const requiredFields = [
    'skinType.type',
    'blackheads.exists',
    'acne.exists',
    'pores.enlarged',
    'overallAssessment.healthScore',
    'overallAssessment.summary'
  ];

  for (const field of requiredFields) {
    const value = getNestedValue(analysisResult, field);
    if (value === undefined || value === null) {
      console.log(`❌ 缺少必需字段: ${field}`);
      return false;
    }
  }

  return true;
};

/**
 * 获取嵌套对象的值
 * @param {Object} obj - 对象
 * @param {string} path - 路径
 * @returns {any} - 值
 */
const getNestedValue = (obj, path) => {
  return path.split('.').reduce((current, key) => current && current[key], obj);
};

module.exports = {
  analyzeSkinCondition,
  validateAnalysisResult
};
