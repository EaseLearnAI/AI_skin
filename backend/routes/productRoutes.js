const express = require('express');
const { 
  createProduct, 
  uploadProductImage, 
  extractIngredients,
  getProducts,
  getProduct,
  updateProduct,
  deleteProduct,
  getUserProducts,
  getUserProductsByLabel
} = require('../controllers/productController');
const { protect } = require('../middleware/authMiddleware');
const { uploadSingle } = require('../middleware/uploadMiddleware');

const router = express.Router();

// 所有路由都需要身份验证
router.use(protect);

// 产品相关路由
router.route('/')
  .post(createProduct)  // 创建产品
  .get(getProducts);    // 获取产品列表

// 单个产品操作
router.route('/:id')
  .get(getProduct)       // 获取单个产品
  .put(updateProduct)    // 更新产品
  .delete(deleteProduct); // 删除产品

// 上传产品图片
router.post('/:id/upload-image', ...uploadSingle('productImage'), uploadProductImage);

// 提取产品成分
router.post('/:id/extract-ingredients', extractIngredients);

// 新增路由：获取用户所有产品简要信息
router.get('/user/:userId', getUserProducts);

// 新增路由：根据标签获取用户产品
router.get('/user/:userId/label/:label', getUserProductsByLabel);

module.exports = router; 