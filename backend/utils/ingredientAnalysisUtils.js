const axios = require('axios');
require('dotenv').config();

// 从环境变量中获取 API 密钥
const API_KEY = process.env.API_KEY;
/**
 * 使用通义千问API分析产品成分
 * @param {String} productName - 产品名称
 * @param {Array} ingredients - 产品成分列表
 * @returns {Promise<Object>} - 分析结果
 */
const analyzeIngredients = async (productName, ingredients) => {
  try {
    console.log('开始分析产品成分:', ingredients);
    console.log('产品名称:', productName);
    
    // 设置API Key

    
    // 构建提示词，强调生成详细的产品描述summary
    const prompt = `
    请作为专业的护肤品成分分析师，分析下面这款产品的成分并返回分析结果。
    
    产品名称：${productName}
    产品成分列表：${ingredients.join('、')}
    
    请分析以下内容并以JSON格式返回：
    1. 安全性指数(0-100)
    2. 功效评分(0-5.0)
    3. 活性成分数量
    4. 致痘风险(低/中/高，百分比)
    5. 刺激风险(低/中/高，百分比)
    6. 过敏风险(低/中/高，百分比)
    7. 功效分析(列出3条主要功效)
    8. 潜在风险(列出最多2条潜在风险)
    9. 使用建议(列出3条使用建议)
    10. AI综合评分(0-5.0，精确到一位小数)
    11. 产品总结评价(summary)：大概的产品描述，只需包含对产品主要功效、适用肤质和整体评价,这将直接作为产品描述使用。
    
    请按照以下格式返回JSON:
    {
      "safetyIndex": 数值,
      "efficacyScore": 数值,
      "activeIngredients": 数值,
      "acneRisk": {"level": "低/中/高", "percentage": 数值},
      "irritationRisk": {"level": "低/中/高", "percentage": 数值},
      "allergyRisk": {"level": "低/中/高", "percentage": 数值},
      "efficacyAnalysis": [三条分析],
      "potentialRisks": [最多两条风险],
      "recommendations": [三条建议],
      "overallRating": 数值,
      "summary": "大概的产品描述，只需包含对产品主要功效、适用肤质和整体评价"
    }`;
    
    // 设置API请求参数
    const data = {
      model: 'qwen-turbo-latest',
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      response_format: { type: "json_object" }
    };
    
    console.log('发送成分分析请求到通义千问API...');
    
    // 发送请求到通义千问API
    const response = await axios.post(
      'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
      data,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`
        }
      }
    );
    
    console.log('通义千问API响应状态:', response.status);
    
    // 解析API返回的内容
    const content = response.data.choices[0].message.content;
    console.log('API返回的原始内容:', content);
    
    // 解析JSON内容
    let analysisResult;
    try {
      analysisResult = JSON.parse(content);
      console.log('成分分析结果解析成功');
    } catch (parseError) {
      console.error('解析成分分析结果失败:', parseError);
      
      // 尝试从文本中提取JSON
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          analysisResult = JSON.parse(jsonMatch[0]);
          console.log('通过正则提取成分分析结果成功');
        } catch (e) {
          throw new Error('无法解析分析结果');
        }
      } else {
        throw new Error('无法提取分析结果');
      }
    }
    
    // 确保summary字段存在，用于更新产品描述
    if (!analysisResult.summary) {
      console.warn('分析结果中没有summary字段，添加默认描述');
      analysisResult.summary = `这是一款名为"${productName}"的护肤产品，根据成分分析，安全性评分为${analysisResult.safetyIndex || '未知'}，功效评分为${analysisResult.efficacyScore || '未知'}。`;
    }
    
    return {
      success: true,
      analysisResult
    };
  } catch (error) {
    console.error('成分分析失败:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data || error.message
    };
  }
};

module.exports = {
  analyzeIngredients
}; 