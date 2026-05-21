const express = require('express');
const { 
  analyzeProductIngredients, 
  getIngredientAnalysis 
} = require('../controllers/ingredientAnalysisController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

// 所有路由都需要身份验证
router.use(protect);

// 分析产品成分
router.post('/:id/analyze-ingredients', analyzeProductIngredients);

// 获取成分分析结果
router.get('/:id/ingredient-analysis', getIngredientAnalysis);

module.exports = router; 