const createIdeaController = (service) => ({
  create: async (req, res) => {
    const idea = await service.create(req.user._id, req.body);
    res.status(201).json({ success: true, message: '反馈提交成功', data: { idea } });
  },
  list: async (req, res) => {
    const ideas = await service.list(req.user._id);
    res.status(200).json({ success: true, count: ideas.length, data: { ideas } });
  },
  get: async (req, res) => {
    const idea = await service.get(req.user._id, req.params.id);
    res.status(200).json({ success: true, data: { idea } });
  },
  update: async (req, res) => {
    const idea = await service.update(req.user._id, req.params.id, req.body);
    res.status(200).json({ success: true, message: '反馈更新成功', data: { idea } });
  },
  remove: async (req, res) => {
    await service.remove(req.user._id, req.params.id);
    res.status(200).json({ success: true, message: '反馈删除成功', data: {} });
  }
});

module.exports = { createIdeaController };
