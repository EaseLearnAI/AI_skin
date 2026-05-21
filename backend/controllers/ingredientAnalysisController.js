const Product = require('../models/productModel');
const { analyzeIngredients } = require('../utils/ingredientAnalysisUtils');

/**
 * 分析产品成分
 * @route POST /api/products/:id/analyze-ingredients
 * @access Private
 */
exports.analyzeProductIngredients = async (req, res) => {
  try {
    console.log('接收到分析产品成分请求');
    
    const { id } = req.params;
    
    // 验证产品ID
    if (!id) {
      return res.status(400).json({
        success: false,
        message: '请提供产品ID'
      });
    }
    
    // 查找产品
    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: '产品不存在'
      });
    }
    
    // 验证用户权限
    if (product.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: '没有权限分析此产品'
      });
    }
    
    // 检查产品是否有成分列表
    if (!product.ingredients || product.ingredients.length === 0) {
      return res.status(400).json({
        success: false,
        message: '产品没有成分列表，请先提取产品成分'
      });
    }
    
    console.log(`开始分析产品"${product.name}"的成分...`);
    
    // 调用成分分析工具，传入产品名称和成分列表
    const analysisResult = await analyzeIngredients(product.name, product.ingredients);
    
    if (!analysisResult.success) {
      return res.status(500).json({
        success: false,
        message: '成分分析失败',
        error: analysisResult.error
      });
    }
    
    // 更新产品的成分分析结果
    product.ingredientAnalysis = analysisResult.analysisResult;
    
    // 始终使用分析结果中的summary更新产品描述
    if (analysisResult.analysisResult.summary) {
      product.description = analysisResult.analysisResult.summary;
      console.log('使用分析结果更新产品描述:', product.description.substring(0, 50) + '...');
    }
    
    await product.save();
    
    console.log('成分分析完成并保存到产品记录');
    
    res.status(200).json({
      success: true,
      message: '产品成分分析成功',
      data: {
        ingredientAnalysis: product.ingredientAnalysis,
        description: product.description
      }
    });
  } catch (error) {
    console.error('分析产品成分失败:', error);
    res.status(400).json({
      success: false,
      message: '分析产品成分失败',
      error: error.message
    });
  }
};

/**
 * 获取产品的成分分析结果
 * @route GET /api/products/:id/ingredient-analysis
 * @access Private
 */
exports.getIngredientAnalysis = async (req, res) => {
  try {
    console.log('接收到获取产品成分分析请求');
    
    const { id } = req.params;
    
    // 验证产品ID
    if (!id) {
      return res.status(400).json({
        success: false,
        message: '请提供产品ID'
      });
    }
    
    // 查找产品
    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: '产品不存在'
      });
    }
    
    // 验证用户权限
    if (product.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: '没有权限查看此产品的分析结果'
      });
    }
    
    // 检查产品是否有成分分析结果
    if (!product.ingredientAnalysis) {
      return res.status(404).json({
        success: false,
        message: '该产品尚未进行成分分析，请先分析成分'
      });
    }
    
    console.log(`获取产品"${product.name}"的成分分析结果`);
    
    res.status(200).json({
      success: true,
      data: {
        product: {
          _id: product._id,
          name: product.name,
          description: product.description,
          label: product.label,
          imageUrl: product.imageUrl,
          ingredients: product.ingredients,
          openingDate: product.openingDate
        },
        ingredientAnalysis: product.ingredientAnalysis
      }
    });
  } catch (error) {
    console.error('获取产品成分分析失败:', error);
    res.status(400).json({
      success: false,
      message: '获取产品成分分析失败',
      error: error.message
    });
  }
}; 