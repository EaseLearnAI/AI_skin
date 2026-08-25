const fs = require('fs/promises');

const Product = require('../models/product.model');
const { ApiError } = require('../middlewares/error');

const isImage = (buffer) => (
  (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff)
  || (buffer[0] === 0x89 && buffer.toString('ascii', 1, 4) === 'PNG')
  || buffer.toString('ascii', 0, 3) === 'GIF'
);

const createProductService = ({ aiProvider, storageProvider }) => {
  const present = async (product) => {
    const value = product.toObject ? product.toObject() : { ...product };
    if (value.storageKey && storageProvider.getProductUrl) {
      value.imageUrl = await storageProvider.getProductUrl(value.storageKey, value.imageUrl);
    }
    delete value.storageKey;
    return value;
  };

  const owned = async (id, userId, includeStorageKey = false) => {
    let query = Product.findOne({ _id: id, createdBy: userId });
    if (includeStorageKey) query = query.select('+storageKey');
    const product = await query;
    if (!product) throw new ApiError(404, '产品不存在', 'PRODUCT_NOT_FOUND');
    return product;
  };

  return {
    create: (userId, input) => Product.create({
      name: input.name || '未命名产品',
      description: input.description || '',
      label: input.label || '',
      openingDate: input.openingDate ? new Date(input.openingDate) : null,
      createdBy: userId
    }),
    async uploadImage(userId, id, file) {
      if (!file) throw new ApiError(400, '请上传产品图片', 'IMAGE_REQUIRED');
      const product = await owned(id, userId, true);
      try {
        const signature = await fs.readFile(file.path);
        if (!isImage(signature)) throw new ApiError(400, '文件内容不是受支持的图片', 'INVALID_IMAGE');
        const uploaded = await storageProvider.uploadProductImage(file);
        if (product.storageKey) await storageProvider.deleteObject(product.storageKey);
        product.imageUrl = uploaded.url;
        product.storageKey = uploaded.key;
        await product.save();
        return product.imageUrl;
      } finally {
        await storageProvider.cleanupTempFile(file.path);
      }
    },
    async extractIngredients(userId, id) {
      const product = await owned(id, userId, true);
      if (!product.imageUrl) throw new ApiError(400, '产品没有图片，请先上传图片', 'PRODUCT_IMAGE_REQUIRED');
      const imageUrl = product.storageKey && storageProvider.getProductUrl
        ? await storageProvider.getProductUrl(product.storageKey, product.imageUrl)
        : product.imageUrl;
      const result = await aiProvider.extractProductInfo({ imageUrl });
      product.ingredients = result.ingredients;
      if (result.productName) product.name = result.productName;
      await product.save();
      return { name: product.name, ingredients: product.ingredients, rawContent: result.rawContent };
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
      if (input.openingDate !== undefined) product.openingDate = input.openingDate ? new Date(input.openingDate) : null;
      await product.save();
      return present(product);
    },
    async remove(userId, id) {
      const product = await owned(id, userId, true);
      await Product.deleteOne({ _id: product._id, createdBy: userId });
      if (product.storageKey) await storageProvider.deleteObject(product.storageKey);
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
        safetyScore: product.ingredientAnalysis?.safetyIndex || 0,
        efficacyScore: product.ingredientAnalysis?.efficacyScore || 0,
        overallRating: product.ingredientAnalysis?.overallRating || 0
      })));
    },
    async analyzeIngredients(userId, id) {
      const product = await owned(id, userId);
      if (!product.ingredients.length) {
        throw new ApiError(400, '产品没有成分列表，请先提取产品成分', 'INGREDIENTS_REQUIRED');
      }
      const analysis = await aiProvider.analyzeIngredients({
        productName: product.name,
        ingredients: product.ingredients
      });
      product.ingredientAnalysis = analysis;
      product.description = analysis.summary;
      await product.save();
      return { ingredientAnalysis: analysis, description: product.description };
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
