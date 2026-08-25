const createConflictController = (service) => ({
  analyze: async (req, res) => {
    const { record, result, products } = await service.analyze(req.user._id, req.body.productIds);
    res.status(201).json({
      success: true,
      message: '产品冲突分析成功',
      data: {
        conflictId: record._id,
        conflicts: result.conflicts,
        safeCombo: result.safeCombo,
        recommendations: result.recommendations,
        products: products.map((product) => ({
          id: product._id,
          name: product.name,
          description: product.description,
          imageUrl: product.imageUrl
        }))
      }
    });
  },
  list: async (req, res) => {
    const conflicts = await service.list(req.user._id);
    res.status(200).json({ success: true, count: conflicts.length, data: { conflicts } });
  },
  get: async (req, res) => {
    const conflict = await service.get(req.user._id, req.params.id);
    res.status(200).json({ success: true, data: { conflict } });
  },
  remove: async (req, res) => {
    await service.remove(req.user._id, req.params.id);
    res.status(200).json({ success: true, message: '冲突分析记录删除成功', data: {} });
  },
  summary: async (req, res) => {
    const conflicts = await service.summary(req.user._id);
    res.status(200).json({ success: true, count: conflicts.length, data: { conflicts } });
  }
});

module.exports = { createConflictController };
