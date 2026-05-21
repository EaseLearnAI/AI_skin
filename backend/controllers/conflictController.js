const axios = require('axios');
const Conflict = require('../models/conflictModel');
const Product = require('../models/productModel');
require('dotenv').config();

// 从环境变量中获取 API 密钥
const API_KEY = process.env.API_KEY;
// 分析产品成分冲突
const analyzeConflict = async (req, res) => {
  try {
    const { productIds } = req.body;

    if (!productIds || !Array.isArray(productIds) || productIds.length < 2) {
      return res.status(400).json({
        success: false,
        message: '请至少提供两个产品ID'
      });
    }

    console.log(`开始分析产品冲突，产品IDs: ${productIds}`);

    // 获取产品详情
    const products = await Product.find({ 
      _id: { $in: productIds },
      createdBy: req.user._id 
    });

    if (products.length !== productIds.length) {
      return res.status(404).json({
        success: false,
        message: '无法找到所有指定的产品或部分产品不属于当前用户'
      });
    }

    // 检查产品是否有成分
    const productsWithoutIngredients = products.filter(p => !p.ingredients || p.ingredients.length === 0);
    if (productsWithoutIngredients.length > 0) {
      const names = productsWithoutIngredients.map(p => p.name).join(', ');
      return res.status(400).json({
        success: false,
        message: `以下产品没有成分信息，无法进行冲突分析: ${names}`
      });
    }

    // 准备提示词
    const productInfo = products.map(p => ({
      name: p.name,
      ingredients: p.ingredients
    }));

    const prompt = `
作为一名专业的护肤品成分分析专家，请分析以下${products.length}个护肤品的成分是否存在使用冲突。

产品信息：
${productInfo.map((p, i) => `产品${i+1}: ${p.name}
成分: ${p.ingredients.join(', ')}`).join('\n\n')}

请以JSON格式输出分析结果，包括以下字段：
{
  "conflicts": [
    {
      "components": ["成分1", "成分2"],
      "severity": "高/中/低",
      "description": "冲突描述",
      "effects": ["可能影响1", "可能影响2"]
    }
  ],
  "safeCombo": [
    {
      "components": ["成分1", "成分2"],
      "description": "这些成分可以安全组合使用的原因"
    }
  ],
  "recommendations": {
    "productPairings": {
      "cannotUseTogether": [
        {
          "products": ["产品名称1", "产品名称2"],
          "reason": "不能一起使用的原因"
        }
      ],
      "canUseTogether": [
        {
          "products": ["产品名称1", "产品名称2"],
          "reason": "可以一起使用的原因"
        }
      ]
    },
    "routines": {
      "morning": ["建议的早晨使用顺序，例如：产品1 → 产品2"],
      "evening": ["建议的晚间使用顺序，例如：产品1 → 产品3"]
    }
  }
}

请确保输出符合标准JSON格式，不要添加任何额外的格式化、注释或说明。分析必须科学严谨，基于成分的实际相互作用情况。`;

    console.log('发送冲突分析请求到AI模型');

    // 调用通义千问API
    const response = await axios.post(
      'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
      {
        model: 'qwen-turbo-latest',
        messages: [
          { role: 'user', content: prompt }
        ]
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`
        }
      }
    );

    console.log('AI模型返回分析结果');

    let analysisResult;
    try {
      // 提取JSON内容
      const content = response.data.choices[0].message.content;
      console.log(`AI返回原始结果: ${content}`);
      
      // 尝试解析JSON
      analysisResult = JSON.parse(content);
    } catch (error) {
      console.error('解析AI返回结果失败:', error);
      return res.status(500).json({
        success: false,
        message: 'AI返回结果解析失败',
        error: error.message
      });
    }

    // 保存冲突分析结果到数据库
    const conflictRecord = await Conflict.create({
      products: productIds,
      conflicts: analysisResult.conflicts || [],
      safeCombo: analysisResult.safeCombo || [],
      recommendations: analysisResult.recommendations || {},
      createdBy: req.user._id
    });

    console.log(`冲突分析结果已保存，ID: ${conflictRecord._id}`);

    return res.status(201).json({
      success: true,
      message: '产品冲突分析成功',
      data: {
        conflictId: conflictRecord._id,
        conflicts: analysisResult.conflicts,
        safeCombo: analysisResult.safeCombo,
        recommendations: analysisResult.recommendations,
        products: products.map(p => ({
          id: p._id,
          name: p.name,
          description: p.description,
          imageUrl: p.imageUrl
        }))
      }
    });
  } catch (error) {
    console.error('产品冲突分析失败:', error);
    return res.status(500).json({
      success: false,
      message: '产品冲突分析失败',
      error: error.message
    });
  }
};

// 获取用户的所有冲突分析记录
const getUserConflicts = async (req, res) => {
  try {
    const conflicts = await Conflict.find({ createdBy: req.user._id })
      .populate('products', 'name description imageUrl')
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: conflicts.length,
      data: {
        conflicts
      }
    });
  } catch (error) {
    console.error('获取冲突分析记录失败:', error);
    return res.status(500).json({
      success: false,
      message: '获取冲突分析记录失败',
      error: error.message
    });
  }
};

// 获取单个冲突分析记录
const getConflict = async (req, res) => {
  try {
    const conflict = await Conflict.findOne({ 
      _id: req.params.id,
      createdBy: req.user._id
    }).populate('products', 'name description imageUrl ingredients');

    if (!conflict) {
      return res.status(404).json({
        success: false,
        message: '未找到冲突分析记录'
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        conflict
      }
    });
  } catch (error) {
    console.error('获取冲突分析记录失败:', error);
    return res.status(500).json({
      success: false,
      message: '获取冲突分析记录失败',
      error: error.message
    });
  }
};

// 删除冲突分析记录
const deleteConflict = async (req, res) => {
  try {
    const conflict = await Conflict.findOneAndDelete({ 
      _id: req.params.id,
      createdBy: req.user._id
    });

    if (!conflict) {
      return res.status(404).json({
        success: false,
        message: '未找到冲突分析记录'
      });
    }

    return res.status(200).json({
      success: true,
      message: '冲突分析记录删除成功',
      data: {}
    });
  } catch (error) {
    console.error('删除冲突分析记录失败:', error);
    return res.status(500).json({
      success: false,
      message: '删除冲突分析记录失败',
      error: error.message
    });
  }
};

// 获取用户冲突检测摘要
const getUserConflictsSummary = async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: '请提供用户ID'
      });
    }
    
    const conflicts = await Conflict.find({ createdBy: userId })
      .populate('products', 'name')
      .select('_id products createdAt')
      .sort({ createdAt: -1 });
    
    // 格式化返回结果
    const conflictSummaries = conflicts.map(conflict => ({
      id: conflict._id,
      products: conflict.products.map(p => p.name),
      createdAt: conflict.createdAt
    }));
    
    return res.status(200).json({
      success: true,
      count: conflictSummaries.length,
      data: {
        conflicts: conflictSummaries
      }
    });
  } catch (error) {
    console.error('获取用户冲突检测摘要失败:', error);
    return res.status(500).json({
      success: false,
      message: '获取用户冲突检测摘要失败',
      error: error.message
    });
  }
};

// 获取冲突检测详情（通过ID）
const getConflictById = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).json({
        success: false,
        message: '请提供冲突检测ID'
      });
    }
    
    const conflict = await Conflict.findById(id)
      .populate('products', 'name description imageUrl ingredients');
    
    if (!conflict) {
      return res.status(404).json({
        success: false,
        message: '未找到冲突检测记录'
      });
    }
    
    return res.status(200).json({
      success: true,
      data: {
        conflict
      }
    });
  } catch (error) {
    console.error('获取冲突检测详情失败:', error);
    return res.status(500).json({
      success: false,
      message: '获取冲突检测详情失败',
      error: error.message
    });
  }
};

module.exports = {
  analyzeConflict,
  getUserConflicts,
  getConflict,
  deleteConflict,
  getUserConflictsSummary,
  getConflictById
}; 