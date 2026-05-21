const axios = require('axios');
require('dotenv').config();

// 从环境变量中获取 API 密钥
const API_KEY = process.env.API_KEY;
/**
 * 使用通义千问OCR API提取图片中的产品名称和成分
 * @param {String} imageUrl - 图片URL
 * @returns {Promise<Object>} - 提取结果，包含产品名称和成分列表
 */
const extractProductInfo = async (imageUrl) => {
  try {
    console.log('开始OCR提取产品信息，图片URL:', imageUrl);
    
    // 设置API Key

    
    // 设置提取的结构和提示词
    const resultSchema = `{
      "产品名称": "产品名称字符串",
      "产品成分": []
    }`;
    
    // 构建提示词，专注于提取产品名称和成分
    const prompt = `请从图片中提取产品名称和成分信息，并按照下面的格式返回。
    务必识别产品的名称（通常在包装正面或顶部比较显眼的位置）
    同时识别产品成分列表部分（通常以"成分"或"配方"开头）
    如果找不到相关信息，对应字段返回空内容。
    输出格式: ${resultSchema}`;
    
    // 设置API请求参数
    const data = {
      model: 'qwen-vl-ocr-2025-04-13',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: {
                url: imageUrl,
              },
              min_pixels: 28 * 28 * 4,
              max_pixels: 28 * 28 * 8192
            }
          ]
        }
      ]
    };
    
    // 发送请求到通义千问OCR API
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
    
    console.log('OCR API响应状态:', response.status);
    
    // 解析API返回的文本内容
    const content = response.data.choices[0].message.content;
    console.log('OCR原始返回内容:', content);
    
    // 尝试从返回内容中提取JSON结构
    let productName = '';
    let ingredients = [];
    try {
      // 查找JSON内容
      const jsonMatch = content.match(/\{[\s\S]*?\}/);
      if (jsonMatch) {
        const parsedData = JSON.parse(jsonMatch[0]);
        productName = parsedData.产品名称 || '';
        ingredients = parsedData.产品成分 || [];
      } else {
        // 如果没有匹配到JSON，尝试使用其他方式提取
        const lines = content.split('\n');
        
        // 尝试提取产品名称（通常是最前面的几行）
        for (let i = 0; i < Math.min(5, lines.length); i++) {
          if (lines[i].includes('产品名称') || lines[i].includes('名称')) {
            productName = lines[i].replace(/产品名称[：:]\s*/, '').trim();
            break;
          }
        }
        
        // 尝试提取成分列表
        let inIngredientsSection = false;
        for (const line of lines) {
          if (line.includes('成分') || line.includes('配方')) {
            inIngredientsSection = true;
            continue;
          }
          
          if (inIngredientsSection && line.trim()) {
            // 移除数字、标点等，只保留可能的成分名称
            const ingredient = line.replace(/[0-9.,;:()\[\]]/g, '').trim();
            if (ingredient) {
              ingredients.push(ingredient);
            }
          }
        }
      }
    } catch (parseError) {
      console.error('解析OCR结果失败:', parseError);
    }
    
    console.log('提取的产品名称:', productName);
    console.log('提取的成分列表:', ingredients);
    
    return {
      success: true,
      productName,
      ingredients,
      rawContent: content
    };
  } catch (error) {
    console.error('OCR提取失败:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data || error.message,
      productName: '',
      ingredients: []
    };
  }
};

module.exports = {
  extractProductInfo
}; 