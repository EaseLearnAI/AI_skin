const express = require('express');
const { 
  createIdea,
  getUserIdeas,
  getIdea,
  updateIdea,
  deleteIdea
} = require('../controllers/ideaController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

// 所有路由都需要身份验证
router.use(protect);

// 创建反馈 / 获取用户的所有反馈
router.route('/')
  .post(createIdea)
  .get(getUserIdeas);

// 获取/更新/删除单个反馈
router.route('/:id')
  .get(getIdea)
  .put(updateIdea)
  .delete(deleteIdea);

module.exports = router; 