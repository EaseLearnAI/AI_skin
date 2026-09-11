const Conflict = require('../models/conflict.model');
const Product = require('../models/product.model');
const { validateConflictReport, buildConflictAdvice } = require('./conflictReport');
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
    const liveProducts = (conflict.products || []).filter(Boolean);
    if (conflict.productSnapshots?.length) {
      value.products = await Promise.all(conflict.productSnapshots.map(async (snapshot) => {
        const live = liveProducts.find((product) => String(product._id) === String(snapshot._id));
        const historical = snapshot.toObject ? snapshot.toObject() : { ...snapshot };
        return { ...historical, imageUrl: live ? (await presentProduct(live)).imageUrl || '' : '' };
      }));
    } else {
      value.products = await Promise.all(liveProducts.map(presentProduct));
    }
    if (value.reportVersion === 2) {
      delete value.conflicts;
      delete value.safeCombo;
    }
    return value;
  };

  return {
  async analyze(userId, productIds, requestId) {
    const uniqueIds = Array.from(new Set(productIds));
    if (uniqueIds.length < 2) throw new ApiError(400, '请至少提供两个产品ID', 'PRODUCTS_REQUIRED');
    const foundProducts = await Product.find({ _id: { $in: uniqueIds }, createdBy: userId }).select('+storageKey');
    if (foundProducts.length !== uniqueIds.length) {
      throw new ApiError(404, '无法找到所有指定的产品或部分产品不属于当前用户', 'PRODUCT_NOT_FOUND');
    }
    const products = uniqueIds.map((id) => foundProducts.find((product) => String(product._id) === id));
    const incomplete = products.filter((product) => !product.ingredients.length);
    if (incomplete.length) {
      throw new ApiError(400, `以下产品没有成分信息，无法进行冲突分析: ${incomplete.map((p) => p.name).join(', ')}`, 'INGREDIENTS_REQUIRED');
    }
    const input = {
      requestId,
      products: products.map((product) => ({ id: String(product._id), name: product.name, ingredients: product.ingredients }))
    };
    let result;
    // One corrective retry for invalid AI content; no retries for network/auth failures.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        result = await aiProvider.analyzeConflict(input);
        validateConflictReport(result, uniqueIds);
        break;
      } catch (error) {
        if (attempt === 1 || error.code !== 'AI_OUTPUT_INVALID') throw error;
        input.validationFeedback = '上次输出未通过字段、长度或产品关系校验。请重新输出完整JSON，summary缩短到40字以内，explanation缩短到60字以内；不要输出建议；核对全部输入产品对和评分规则。';
      }
    }
    result.recommendations = buildConflictAdvice(result.productPairs);
    const record = await Conflict.create({
      products: uniqueIds,
      productSnapshots: products.map((product) => ({
        _id: product._id, name: product.name, description: product.description,
        ingredients: product.ingredients, label: product.label
      })),
      reportVersion: 2,
      riskScore: result.riskScore,
      summary: result.summary,
      productPairs: result.productPairs,
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
      .populate('products', 'name').select('_id products productSnapshots createdAt').sort({ createdAt: -1 });
    return conflicts.map((conflict) => ({
      id: conflict._id,
      products: (conflict.productSnapshots?.length ? conflict.productSnapshots : conflict.products.filter(Boolean))
        .map((product) => product.name),
      createdAt: conflict.createdAt
    }));
  }
  };
};

module.exports = { createConflictService };
