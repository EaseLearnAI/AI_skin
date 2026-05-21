const express = require('express');
const { 
  analyzeConflict,
  getUserConflicts,
  getConflict,
  deleteConflict,
  getUserConflictsSummary,
  getConflictById
} = require('../controllers/conflictController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

// 所有路由都需要身份验证
router.use(protect);

// 分析产品冲突
router.post('/', analyzeConflict);

// 获取用户的所有冲突分析
router.get('/', getUserConflicts);

// 获取单个冲突分析
router.route('/:id')
  .get(getConflict)
  .delete(deleteConflict);

// 获取特定用户的冲突检测摘要
router.get('/user/:userId', getUserConflictsSummary);

// 获取冲突检测详情（通过ID）
router.get('/detail/:id', getConflictById);

module.exports = router; 