const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  uploadAndAnalyzeSkin,
  getUserSkinAnalyses,
  getSkinAnalysisDetail,
  deleteSkinAnalysis,
  getSkinAnalysisStats,
  getLatestSkinAnalysis
} = require('../controllers/skinAnalysisController');

// 上传并分析皮肤状态
router.post('/analyze', protect, uploadAndAnalyzeSkin);

// 获取用户的皮肤分析历史记录
router.get('/', protect, getUserSkinAnalyses);

// 获取用户皮肤分析统计数据
router.get('/stats', protect, getSkinAnalysisStats);

// 获取用户最新皮肤分析
router.get('/latest', protect, getLatestSkinAnalysis);

// 获取单个皮肤分析详情
router.get('/:id', protect, getSkinAnalysisDetail);

// 删除皮肤分析记录
router.delete('/:id', protect, deleteSkinAnalysis);

module.exports = router; 