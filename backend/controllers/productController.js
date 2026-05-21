const Product = require('../models/productModel');
const { uploadToOSS } = require('../utils/ossUtils');
const { extractProductInfo } = require('../utils/ocrUtils');
const fs = require('fs');
const path = require('path');
const os = require('os');

// 创建临时文件夹用于存储上传的图片
const TEMP_DIR = path.join(os.tmpdir(), 'ai_skin_uploads');
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// 创建新产品
exports.createProduct = async (req, res) => {
  try {
    console.log('接收到创建产品请求');
    
    // 验证请求体
    const { name, description, label, openingDate } = req.body;
    
    // 创建基本产品信息 - 产品名称可以稍后从OCR结果更新
    const product = new Product({
      name: name || '未命名产品', // 允许不提供产品名称，稍后可从OCR更新
      description: description || '',
      label: label || '',
      openingDate: openingDate ? new Date(openingDate) : null, // 添加开封日期字段处理
      createdBy: req.user._id
    });
    
    // 保存产品
    await product.save();
    console.log(`产品基本信息创建成功: ${product._id}`);
    
    res.status(201).json({
      success: true,
      message: '产品创建成功',
      data: {
        product
      }
    });
  } catch (error) {
    console.error('创建产品失败:', error);
    res.status(400).json({
      success: false,
      message: '创建产品失败',
      error: error.message
    });
  }
};

// 上传产品图片
exports.uploadProductImage = async (req, res) => {
  try {
    console.log('接收到产品图片上传请求');
    
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
        message: '没有权限修改此产品'
      });
    }
    
    // 验证请求中是否包含文件
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: '请上传产品图片'
      });
    }
    
    console.log('接收到文件:', req.file.originalname);
    
    // 上传到OSS
    const ossResult = await uploadToOSS(
      req.file.path,
      `${id}-${req.file.originalname}`
    );
    
    if (!ossResult.success) {
      return res.status(500).json({
        success: false,
        message: '上传到OSS失败',
        error: ossResult.error
      });
    }
    
    console.log('图片成功上传到OSS:', ossResult.url);
    
    // 更新产品信息，添加图片URL
    product.imageUrl = ossResult.url;
    await product.save();
    
    // 清理临时文件
    fs.unlinkSync(req.file.path);
    
    res.status(200).json({
      success: true,
      message: '产品图片上传成功',
      data: {
        imageUrl: product.imageUrl
      }
    });
  } catch (error) {
    console.error('上传产品图片失败:', error);
    res.status(400).json({
      success: false,
      message: '上传产品图片失败',
      error: error.message
    });
  }
};

// 提取产品成分
exports.extractIngredients = async (req, res) => {
  try {
    console.log('接收到提取产品成分请求');
    
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
        message: '没有权限修改此产品'
      });
    }
    
    // 验证产品是否有图片
    if (!product.imageUrl) {
      return res.status(400).json({
        success: false,
        message: '产品没有图片，请先上传图片'
      });
    }
    
    // 使用OCR提取产品信息（名称和成分）
    const ocrResult = await extractProductInfo(product.imageUrl);
    
    if (!ocrResult.success) {
      return res.status(500).json({
        success: false,
        message: '成分提取失败',
        error: ocrResult.error
      });
    }
    
    // 更新产品成分和名称（总是使用OCR结果中的产品名称）
    product.ingredients = ocrResult.ingredients;
    
    // 始终更新产品名称（如果OCR识别到）
    if (ocrResult.productName) {
      product.name = ocrResult.productName;
      console.log(`使用OCR识别结果更新产品名称: ${ocrResult.productName}`);
    }
    
    await product.save();
    
    console.log('成分和产品名称提取成功，已保存到产品记录');
    
    res.status(200).json({
      success: true,
      message: '产品成分提取成功',
      data: {
        name: product.name,
        ingredients: product.ingredients,
        rawContent: ocrResult.rawContent
      }
    });
  } catch (error) {
    console.error('提取产品成分失败:', error);
    res.status(400).json({
      success: false,
      message: '提取产品成分失败',
      error: error.message
    });
  }
};

// 获取产品列表
exports.getProducts = async (req, res) => {
  try {
    console.log('接收到获取产品列表请求');
    
    // 分页参数
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    // 查询参数
    const query = { createdBy: req.user._id };
    
    // 查询产品数量
    const total = await Product.countDocuments(query);
    
    // 查询产品
    const products = await Product.find(query)
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });
    
    console.log(`获取到${products.length}个产品`);
    
    res.status(200).json({
      success: true,
      count: products.length,
      total,
      data: {
        products
      },
      pagination: {
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('获取产品列表失败:', error);
    res.status(400).json({
      success: false,
      message: '获取产品列表失败',
      error: error.message
    });
  }
};

// 获取单个产品
exports.getProduct = async (req, res) => {
  try {
    console.log('接收到获取产品详情请求');
    
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
        message: '没有权限查看此产品'
      });
    }
    
    console.log(`获取到产品: ${product._id}`);
    
    res.status(200).json({
      success: true,
      data: {
        product
      }
    });
  } catch (error) {
    console.error('获取产品详情失败:', error);
    res.status(400).json({
      success: false,
      message: '获取产品详情失败',
      error: error.message
    });
  }
};

// 更新产品
exports.updateProduct = async (req, res) => {
  try {
    console.log('接收到更新产品请求');
    
    const { id } = req.params;
    const { name, description, label, openingDate } = req.body; // 添加开封日期
    
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
        message: '没有权限修改此产品'
      });
    }
    
    // 更新产品
    if (name) product.name = name;
    if (description !== undefined) product.description = description;
    if (label !== undefined) product.label = label;
    // 处理开封日期
    if (openingDate !== undefined) {
      product.openingDate = openingDate ? new Date(openingDate) : null;
    }
    
    await product.save();
    
    console.log(`产品更新成功: ${product._id}`);
    
    res.status(200).json({
      success: true,
      message: '产品更新成功',
      data: {
        product
      }
    });
  } catch (error) {
    console.error('更新产品失败:', error);
    res.status(400).json({
      success: false,
      message: '更新产品失败',
      error: error.message
    });
  }
};

// 删除产品
exports.deleteProduct = async (req, res) => {
  try {
    console.log('接收到删除产品请求');
    
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
        message: '没有权限删除此产品'
      });
    }
    
    // 删除产品 - 修改这里，使用deleteOne方法代替remove
    await Product.deleteOne({ _id: id });
    
    console.log(`产品删除成功: ${id}`);
    
    res.status(200).json({
      success: true,
      message: '产品删除成功',
      data: {}
    });
  } catch (error) {
    console.error('删除产品失败:', error);
    res.status(400).json({
      success: false,
      message: '删除产品失败',
      error: error.message
    });
  }
};

// 获取用户所有产品简要信息
exports.getUserProducts = async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: '请提供用户ID'
      });
    }
    
    // 查找该用户的所有产品
    const products = await Product.find({ createdBy: userId });
    
    // 转换为前端需要的格式
    const simplifiedProducts = products.map(product => ({
      id: product._id,
      name: product.name,
      description: product.description,
      label: product.label,
      imageUrl: product.imageUrl,
      safetyScore: product.ingredientAnalysis?.safetyIndex || 0,
      efficacyScore: product.ingredientAnalysis?.efficacyScore || 0,
      overallRating: product.ingredientAnalysis?.overallRating || 0
    }));
    
    return res.status(200).json({
      success: true,
      count: simplifiedProducts.length,
      data: {
        products: simplifiedProducts
      }
    });
  } catch (error) {
    console.error('获取用户产品失败:', error);
    return res.status(500).json({
      success: false,
      message: '获取用户产品失败',
      error: error.message
    });
  }
};

// 根据标签获取用户产品简要信息
exports.getUserProductsByLabel = async (req, res) => {
  try {
    const { userId, label } = req.params;
    
    if (!userId || !label) {
      return res.status(400).json({
        success: false,
        message: '请提供用户ID和标签'
      });
    }
    
    // 查找该用户的对应标签的产品
    const products = await Product.find({ 
      createdBy: userId,
      label: label
    });
    
    // 转换为前端需要的格式
    const simplifiedProducts = products.map(product => ({
      id: product._id,
      name: product.name,
      description: product.description,
      label: product.label,
      imageUrl: product.imageUrl,
      safetyScore: product.ingredientAnalysis?.safetyIndex || 0,
      efficacyScore: product.ingredientAnalysis?.efficacyScore || 0,
      overallRating: product.ingredientAnalysis?.overallRating || 0
    }));
    
    return res.status(200).json({
      success: true,
      count: simplifiedProducts.length,
      data: {
        products: simplifiedProducts
      }
    });
  } catch (error) {
    console.error('获取用户产品失败:', error);
    return res.status(500).json({
      success: false,
      message: '获取用户产品失败',
      error: error.message
    });
  }
}; 