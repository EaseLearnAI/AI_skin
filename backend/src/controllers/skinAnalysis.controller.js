const createSkinAnalysisController = (service) => ({
  analyze: async (req, res) => {
    const analysis = await service.analyze(req.user._id, req.file, req.id);
    res.status(201).json({
      success: true,
      message: '皮肤状态分析完成',
      data: {
        analysisId: analysis._id,
        imageUrl: analysis.imageUrl,
        skinType: analysis.skinType,
        blackheads: analysis.blackheads,
        acne: analysis.acne,
        pores: analysis.pores,
        otherIssues: analysis.otherIssues,
        overallAssessment: analysis.overallAssessment,
        analysisConfig: analysis.analysisConfig,
        context: analysis.context,
        createdAt: analysis.createdAt,
        updatedAt: analysis.updatedAt,
        moisture: analysis.moisture,
        glossiness: analysis.glossiness,
        elasticity: analysis.elasticity,
        problemAreaScore: analysis.problemAreaScore
      }
    });
  },
  list: async (req, res) => {
    const result = await service.list(req.user._id, req.query);
    res.status(200).json({ success: true, data: result });
  },
  get: async (req, res) => {
    const analysis = await service.get(req.user._id, req.params.id);
    res.status(200).json({ success: true, data: { analysis } });
  },
  updateContext: async (req, res) => {
    const analysis = await service.updateContext(req.user._id, req.params.id, req.body);
    res.status(200).json({ success: true, data: { analysis } });
  },
  latest: async (req, res) => {
    const analysis = await service.latest(req.user._id);
    res.status(200).json({ success: true, data: { analysis } });
  },
  stats: async (req, res) => {
    const stats = await service.stats(req.user._id);
    res.status(200).json({ success: true, data: { stats } });
  },
  remove: async (req, res) => {
    await service.remove(req.user._id, req.params.id);
    res.status(200).json({ success: true, message: '分析记录删除成功', data: {} });
  }
});

module.exports = { createSkinAnalysisController };
