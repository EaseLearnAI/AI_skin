const fs = require('fs/promises');
const mongoose = require('mongoose');

const SkinAnalysis = require('../models/skinAnalysis.model');
const { ApiError } = require('../middlewares/error');

const imageSignatureValid = async (path) => {
  const data = await fs.readFile(path);
  return (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff)
    || (data[0] === 0x89 && data.toString('ascii', 1, 4) === 'PNG');
};

const createSkinAnalysisService = ({ aiProvider, storageProvider }) => {
  const present = async (analysis) => {
    const value = analysis.toObject();
    if (analysis.storageKey && storageProvider.getPrivateUrl) {
      value.imageUrl = await storageProvider.getPrivateUrl(analysis.storageKey);
    }
    delete value.storageKey;
    delete value.rawAnalysisResult;
    return value;
  };

  return {
  async analyze(userId, file) {
    if (!file) throw new ApiError(400, '请上传面部图片', 'FACE_IMAGE_REQUIRED');
    let uploaded;
    try {
      if (!(await imageSignatureValid(file.path))) throw new ApiError(400, '文件内容不是受支持的图片', 'INVALID_IMAGE');
      uploaded = await storageProvider.uploadFaceImage(file);
      const result = await aiProvider.analyzeSkin({ imageUrl: uploaded.url });
      try {
        return await SkinAnalysis.create({
          createdBy: userId,
          imageUrl: uploaded.url,
          storageKey: uploaded.key,
          imageName: file.originalname,
          ...result.data,
          rawAnalysisResult: result.rawContent,
          analysisConfig: {
            provider: 'dashscope',
            model: result.model,
            promptVersion: result.promptVersion || 'skin-v1',
            schemaVersion: result.schemaVersion || 'skin-v1',
            analysisDate: new Date(),
            processingTime: result.processingTime
          }
        });
      } catch (error) {
        await storageProvider.deleteObject(uploaded.key);
        throw error;
      }
    } finally {
      await storageProvider.cleanupTempFile(file.path);
    }
  },
  async list(userId, { page = 1, limit = 10 }) {
    const safePage = Math.max(1, Number(page));
    const safeLimit = Math.min(50, Math.max(1, Number(limit)));
    const query = { createdBy: userId };
    const [analyses, total] = await Promise.all([
      SkinAnalysis.find(query).select('+storageKey').sort({ createdAt: -1 }).skip((safePage - 1) * safeLimit).limit(safeLimit),
      SkinAnalysis.countDocuments(query)
    ]);
    return {
      analyses: await Promise.all(analyses.map(present)),
      pagination: { page: safePage, limit: safeLimit, total, pages: Math.ceil(total / safeLimit) }
    };
  },
  async get(userId, id) {
    const analysis = await SkinAnalysis.findOne({ _id: id, createdBy: userId }).select('+storageKey');
    if (!analysis) throw new ApiError(404, '未找到该分析记录', 'SKIN_ANALYSIS_NOT_FOUND');
    return present(analysis);
  },
  async latest(userId) {
    const analysis = await SkinAnalysis.findOne({ createdBy: userId }).select('+storageKey').sort({ createdAt: -1 });
    if (!analysis) throw new ApiError(404, '暂无皮肤分析记录，请先进行皮肤检测', 'SKIN_ANALYSIS_NOT_FOUND');
    return present(analysis);
  },
  async stats(userId) {
    const objectId = new mongoose.Types.ObjectId(userId);
    const [totalAnalyses, latestAnalysis, skinTypeStats, healthScoreTrend, avgHealthScore] = await Promise.all([
      SkinAnalysis.countDocuments({ createdBy: objectId }),
      SkinAnalysis.findOne({ createdBy: objectId }).sort({ createdAt: -1 }),
      SkinAnalysis.aggregate([
        { $match: { createdBy: objectId } },
        { $group: { _id: '$skinType.type', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
      SkinAnalysis.find({ createdBy: objectId }).sort({ createdAt: -1 }).limit(10)
        .select('overallAssessment.healthScore createdAt').lean(),
      SkinAnalysis.aggregate([
        { $match: { createdBy: objectId } },
        { $group: { _id: null, avgScore: { $avg: '$overallAssessment.healthScore' } } }
      ])
    ]);
    return {
      totalAnalyses,
      latestAnalysisDate: latestAnalysis?.createdAt || null,
      averageHealthScore: avgHealthScore.length ? Math.round(avgHealthScore[0].avgScore) : 0,
      skinTypeDistribution: skinTypeStats,
      healthScoreTrend: healthScoreTrend.reverse(),
      latestSkinCondition: latestAnalysis?.overallAssessment.skinCondition || null
    };
  },
  async remove(userId, id) {
    const analysis = await SkinAnalysis.findOne({ _id: id, createdBy: userId }).select('+storageKey');
    if (!analysis) throw new ApiError(404, '未找到该分析记录', 'SKIN_ANALYSIS_NOT_FOUND');
    await storageProvider.deleteObject(analysis.storageKey);
    await SkinAnalysis.deleteOne({ _id: analysis._id, createdBy: userId });
  }
  };
};

module.exports = { createSkinAnalysisService };
