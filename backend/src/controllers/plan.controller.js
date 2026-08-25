const createPlanController = (service) => ({
  generate: async (req, res) => {
    const plan = await service.generate(req.user._id, req.body);
    res.status(201).json({ success: true, message: '护肤方案生成成功', data: { plan } });
  },
  list: async (req, res) => {
    const plans = await service.list(req.user._id);
    res.status(200).json({ success: true, count: plans.length, data: { plans } });
  },
  get: async (req, res) => {
    const plan = await service.get(req.user._id, req.params.id);
    res.status(200).json({ success: true, data: { plan } });
  },
  remove: async (req, res) => {
    await service.remove(req.user._id, req.params.id);
    res.status(200).json({ success: true, message: '护肤方案删除成功', data: {} });
  },
  updateStep: async (req, res) => {
    const plan = await service.updateStep(req.user._id, req.params.id, req.body);
    res.status(200).json({ success: true, message: '步骤状态更新成功', data: { plan } });
  },
  custom: async (req, res) => {
    const plan = await service.createCustom(req.user._id, req.body);
    res.status(201).json({ success: true, message: '自定义方案创建成功', data: { plan } });
  }
});

module.exports = { createPlanController };
