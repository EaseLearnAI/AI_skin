const Conflict = require('../models/conflict.model');
const Product = require('../models/product.model');
const { ApiError } = require('../middlewares/error');

const createConflictService = ({ aiProvider, storageProvider }) => {
  const presentProduct = async (product) => {
    const value = product.toObject ? product.toObject() : { ...product };
    if (value.storageKey && storageProvider?.getProductUrl) {
      value.imageUrl = await storageProvider.getProductUrl(value.storageKey, value.imageUrl);
    }
    delete value.storageKey;
    return value;
  };
  const presentConflict = async (conflict) => {
    const value = conflict.toObject ? conflict.toObject() : { ...conflict };
    value.products = await Promise.all((conflict.products || []).map(presentProduct));
    return value;
  };

  return {
  async analyze(userId, productIds) {
    const uniqueIds = Array.from(new Set(productIds));
    if (uniqueIds.length < 2) throw new ApiError(400, '请至少提供两个产品ID', 'PRODUCTS_REQUIRED');
    const products = await Product.find({ _id: { $in: uniqueIds }, createdBy: userId }).select('+storageKey');
    if (products.length !== uniqueIds.length) {
      throw new ApiError(404, '无法找到所有指定的产品或部分产品不属于当前用户', 'PRODUCT_NOT_FOUND');
    }
    const incomplete = products.filter((product) => !product.ingredients.length);
    if (incomplete.length) {
      throw new ApiError(400, `以下产品没有成分信息，无法进行冲突分析: ${incomplete.map((p) => p.name).join(', ')}`, 'INGREDIENTS_REQUIRED');
    }
    const result = await aiProvider.analyzeConflict({
      products: products.map((product) => ({ name: product.name, ingredients: product.ingredients }))
    });
    const record = await Conflict.create({
      products: uniqueIds,
      conflicts: result.conflicts,
      safeCombo: result.safeCombo,
      recommendations: result.recommendations,
      createdBy: userId
    });
    return { record, result, products: await Promise.all(products.map(presentProduct)) };
  },
  async list(userId) {
    const conflicts = await Conflict.find({ createdBy: userId })
      .populate('products', 'name description imageUrl +storageKey').sort({ createdAt: -1 });
    return Promise.all(conflicts.map(presentConflict));
  },
  async get(userId, id) {
    const conflict = await Conflict.findOne({ _id: id, createdBy: userId })
      .populate('products', 'name description imageUrl ingredients +storageKey');
    if (!conflict) throw new ApiError(404, '未找到冲突分析记录', 'CONFLICT_NOT_FOUND');
    return presentConflict(conflict);
  },
  async remove(userId, id) {
    const conflict = await Conflict.findOneAndDelete({ _id: id, createdBy: userId });
    if (!conflict) throw new ApiError(404, '未找到冲突分析记录', 'CONFLICT_NOT_FOUND');
  },
  async summary(userId) {
    const conflicts = await Conflict.find({ createdBy: userId })
      .populate('products', 'name').select('_id products createdAt').sort({ createdAt: -1 });
    return conflicts.map((conflict) => ({
      id: conflict._id,
      products: conflict.products.map((product) => product.name),
      createdAt: conflict.createdAt
    }));
  }
  };
};

module.exports = { createConflictService };
