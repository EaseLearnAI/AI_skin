const Product = require('../models/product.model');
const { ApiError } = require('../middlewares/error');

const openingFields = (input) => {
  if (input.openingStatus !== undefined) {
    return { openingStatus: input.openingStatus,
      ...(input.openingStatus !== 'opened' ? { openingDate: null }
        : input.openingDate !== undefined ? { openingDate: input.openingDate ? new Date(input.openingDate) : null } : {}) };
  }
  if (input.openingDate !== undefined) return {
    openingDate: input.openingDate ? new Date(input.openingDate) : null,
    openingStatus: input.openingDate ? 'opened' : 'unknown'
  };
  return {};
};

const clearIngredientAnalysis = (product) => {
  if (product.ingredientAnalysis && product.description === product.ingredientAnalysis.summary) product.description = '';
  product.ingredientAnalysis = null;
  product.ingredientAnalysisConfig = null;
  product.rawIngredientAnalysisResult = null;
};

// Long AI calls must only commit against the exact product revision they read.
const revisionOf = (product) => ({
  _id: product._id,
  createdBy: product.createdBy,
  updatedAt: product.updatedAt,
  __v: product.__v
});

const productChanged = () => new ApiError(409, '产品已更新，请基于当前图片和成分重新分析', 'PRODUCT_CHANGED');

const createProductService = ({ aiProvider, storageProvider, imageUploadWorkflow, logger = { error: () => undefined } }) => {
  const present = async (product) => {
    const value = product.toObject ? product.toObject() : { ...product };
    if (value.storageKey && storageProvider.getProductUrl) {
      value.imageUrl = await storageProvider.getProductUrl(value.storageKey, value.imageUrl);
    }
    value.openingStatus = value.openingStatus || (value.openingDate ? 'opened' : 'unknown');
    delete value.storageKey;
    delete value.pendingStorageKeys;
    delete value.rawOcrResult;
    delete value.rawIngredientAnalysisResult;
    return value;
  };

  const owned = async (id, userId, includeStorageKey = false) => {
    let query = Product.findOne({ _id: id, createdBy: userId });
    if (includeStorageKey) query = query.select('+storageKey +pendingStorageKeys');
    const product = await query;
    if (!product) throw new ApiError(404, '产品不存在', 'PRODUCT_NOT_FOUND');
    return product;
  };

  const cleanupPreviousImages = async (productId, keys) => {
    for (const key of keys) {
      try {
        await storageProvider.deleteObject(key);
        await Product.updateOne({ _id: productId }, { $pull: { pendingStorageKeys: key } });
      } catch (error) {
        // The key remains on the product so replacement or account deletion can retry it.
        logger.error({ event: 'product_image_cleanup_pending', productId: String(productId), errorName: error.name });
      }
    }
  };

  return {
    create: (userId, input) => Product.create({
      name: input.name || '未命名产品',
      description: input.description || '',
      label: input.label || '',
      openingStatus: 'unknown',
      openingDate: null,
      ...openingFields(input),
      createdBy: userId
    }),
    async uploadImage(userId, id, file) {
      const { saved, pendingStorageKeys } = await imageUploadWorkflow({
        kind: 'product', file,
        prepare: () => owned(id, userId, true),
        persist: async (uploaded, product) => {
          clearIngredientAnalysis(product);
          const pendingStorageKeys = [...new Set([...(product.pendingStorageKeys || []), product.storageKey])]
            .filter((key) => key && key !== uploaded.key);
          const saved = await Product.findOneAndUpdate(revisionOf(product), {
            $set: { imageUrl: uploaded.url, storageKey: uploaded.key, ingredients: [],
              ingredientAnalysis: null, ingredientAnalysisConfig: null, rawIngredientAnalysisResult: null,
              ocrConfig: null, rawOcrResult: null, pendingStorageKeys, description: product.description },
            $inc: { __v: 1 }
          }, { returnDocument: 'after', runValidators: true });
          if (!saved) throw productChanged();
          return { saved, pendingStorageKeys };
        }
      });
      // Only the service decides when an old committed image can be removed.
      await cleanupPreviousImages(saved._id, pendingStorageKeys);
      return saved.imageUrl;
    },
    async extractIngredients(userId, id, requestId) {
      const product = await owned(id, userId, true);
      if (!product.imageUrl) throw new ApiError(400, '产品没有图片，请先上传图片', 'PRODUCT_IMAGE_REQUIRED');
      const imageUrl = product.storageKey && storageProvider.getProductUrl
        ? await storageProvider.getProductUrl(product.storageKey, product.imageUrl)
        : product.imageUrl;
      const result = await aiProvider.extractProductInfo({ imageUrl, requestId });
      if (!result.ingredients.length) {
        throw new ApiError(422, '图片中未识别到可用成分，请上传清晰完整的成分表', 'OCR_INGREDIENTS_NOT_FOUND');
      }
      if (JSON.stringify(product.ingredients) !== JSON.stringify(result.ingredients)
        || (result.productName && result.productName !== product.name)) clearIngredientAnalysis(product);
      const saved = await Product.findOneAndUpdate(revisionOf(product), {
        $set: { ingredients: result.ingredients, name: result.productName || product.name,
          ingredientAnalysis: product.ingredientAnalysis,
          ingredientAnalysisConfig: product.ingredientAnalysisConfig,
          ...(product.ingredientAnalysis === null ? { rawIngredientAnalysisResult: null } : {}),
          ocrConfig: result.analysisConfig, rawOcrResult: result.rawContent, description: product.description },
        $inc: { __v: 1 }
      }, { returnDocument: 'after', runValidators: true });
      if (!saved) throw productChanged();
      return { name: saved.name, ingredients: saved.ingredients, rawContent: result.rawContent,
        analysisConfig: saved.ocrConfig };
    },
    async list(userId, { page = 1, limit = 10 } = {}) {
      const safePage = Math.max(1, Number(page));
      const safeLimit = Math.min(50, Math.max(1, Number(limit)));
      const query = { createdBy: userId };
      const [total, products] = await Promise.all([
        Product.countDocuments(query),
        Product.find(query).select('+storageKey').sort({ createdAt: -1 })
          .skip((safePage - 1) * safeLimit).limit(safeLimit)
      ]);
      return {
        products: await Promise.all(products.map(present)),
        total,
        page: safePage,
        limit: safeLimit,
        pages: Math.ceil(total / safeLimit)
      };
    },
    async get(userId, id) {
      return present(await owned(id, userId, true));
    },
    async update(userId, id, input) {
      const product = await owned(id, userId, true);
      for (const field of ['name', 'description', 'label']) {
        if (input[field] !== undefined) product[field] = input[field];
      }
      Object.assign(product, openingFields(input));
      await product.save();
      return present(product);
    },
    async remove(userId, id) {
      const product = await owned(id, userId, true);
      for (const key of new Set([...(product.pendingStorageKeys || []), product.storageKey].filter(Boolean))) {
        await storageProvider.deleteObject(key);
      }
      const removed = await Product.deleteOne(revisionOf(product));
      if (!removed.deletedCount) throw productChanged();
    },
    async listCompatibility(userId, label) {
      const query = { createdBy: userId };
      if (label) query.label = label;
      const products = await Product.find(query).select('+storageKey').sort({ createdAt: -1 });
      return Promise.all(products.map(async (product) => ({
        id: product._id,
        name: product.name,
        description: product.description,
        label: product.label,
        imageUrl: product.storageKey && storageProvider.getProductUrl
          ? await storageProvider.getProductUrl(product.storageKey, product.imageUrl)
          : product.imageUrl,
        ingredients: product.ingredients,
        openingDate: product.openingDate,
        openingStatus: product.openingStatus || (product.openingDate ? 'opened' : 'unknown'),
        safetyScore: product.ingredientAnalysis?.safetyIndex ?? null,
        efficacyScore: product.ingredientAnalysis?.efficacyScore ?? null,
        overallRating: product.ingredientAnalysis?.overallRating ?? null
      })));
    },
    async analyzeIngredients(userId, id, requestId) {
      const product = await owned(id, userId);
      if (!product.ingredients.length) {
        throw new ApiError(400, '产品没有成分列表，请先提取产品成分', 'INGREDIENTS_REQUIRED');
      }
      const input = {
        productName: product.name,
        ingredients: product.ingredients,
        requestId
      };
      let result;
      try {
        result = await aiProvider.analyzeIngredients(input);
      } catch (error) {
        if (error.code !== 'AI_OUTPUT_INVALID') throw error;
        result = await aiProvider.analyzeIngredients({ ...input,
          validationFeedback: '上次结果未通过结构或长度校验。重新输出完整JSON：summary不超过60字，三个数组各1至3条，每条使用标题：说明，标题不超过12字、说明不超过42字，保留必要的条件和风险。' });
      }
      const { analysisConfig, rawContent, ...analysis } = result;
      const saved = await Product.findOneAndUpdate(revisionOf(product), {
        $set: { ingredientAnalysis: analysis, description: analysis.summary,
          ingredientAnalysisConfig: analysisConfig, rawIngredientAnalysisResult: rawContent },
        $inc: { __v: 1 }
      }, { returnDocument: 'after', runValidators: true });
      if (!saved) throw productChanged();
      return { ingredientAnalysis: saved.ingredientAnalysis, description: saved.description,
        analysisConfig: saved.ingredientAnalysisConfig };
    },
    async getIngredientAnalysis(userId, id) {
      const product = await owned(id, userId, true);
      if (!product.ingredientAnalysis) {
        throw new ApiError(404, '该产品尚未进行成分分析，请先分析成分', 'ANALYSIS_NOT_FOUND');
      }
      return { product: await present(product), ingredientAnalysis: product.ingredientAnalysis };
    }
  };
};

module.exports = { createProductService };
