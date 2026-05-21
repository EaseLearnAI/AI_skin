const express = require('express');
const { 
  generatePlan,
  getUserPlans,
  getPlan,
  deletePlan
} = require('../controllers/planController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

// 所有路由都需要身份验证
router.use(protect);

// 生成护肤方案
router.post('/', generatePlan);

// 获取用户的所有护肤方案
router.get('/', getUserPlans);

// 获取单个护肤方案 / 删除护肤方案
router.route('/:id')
  .get(getPlan)
  .delete(deletePlan);

module.exports = router; 