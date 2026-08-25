const createProductController = (service) => ({
  create: async (req, res) => {
    const product = await service.create(req.user._id, req.body);
    res.status(201).json({ success: true, message: '产品创建成功', data: { product } });
  },
  uploadImage: async (req, res) => {
    const imageUrl = await service.uploadImage(req.user._id, req.params.id, req.file);
    res.status(200).json({ success: true, message: '产品图片上传成功', data: { imageUrl } });
  },
  extractIngredients: async (req, res) => {
    const data = await service.extractIngredients(req.user._id, req.params.id);
    res.status(200).json({ success: true, message: '产品成分提取成功', data });
  },
  list: async (req, res) => {
    const result = await service.list(req.user._id, req.query);
    res.status(200).json({
      success: true,
      count: result.products.length,
      total: result.total,
      data: { products: result.products },
      pagination: { page: result.page, limit: result.limit, pages: result.pages }
    });
  },
  get: async (req, res) => {
    const product = await service.get(req.user._id, req.params.id);
    res.status(200).json({ success: true, data: { product } });
  },
  update: async (req, res) => {
    const product = await service.update(req.user._id, req.params.id, req.body);
    res.status(200).json({ success: true, message: '产品更新成功', data: { product } });
  },
  remove: async (req, res) => {
    await service.remove(req.user._id, req.params.id);
    res.status(200).json({ success: true, message: '产品删除成功', data: {} });
  },
  listCompatibility: async (req, res) => {
    const products = await service.listCompatibility(req.user._id);
    res.status(200).json({ success: true, count: products.length, data: { products } });
  },
  listByLabel: async (req, res) => {
    const products = await service.listCompatibility(req.user._id, req.params.label);
    res.status(200).json({ success: true, count: products.length, data: { products } });
  },
  analyzeIngredients: async (req, res) => {
    const data = await service.analyzeIngredients(req.user._id, req.params.id);
    res.status(200).json({ success: true, message: '产品成分分析成功', data });
  },
  getIngredientAnalysis: async (req, res) => {
    const data = await service.getIngredientAnalysis(req.user._id, req.params.id);
    res.status(200).json({ success: true, data });
  }
});

module.exports = { createProductController };
