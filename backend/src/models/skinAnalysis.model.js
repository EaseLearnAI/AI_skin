const mongoose = require('mongoose');
const { analysisConfigSchema } = require('./schemas/analysisConfig.schema');

const skinAnalysisSchema = new mongoose.Schema({
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  imageUrl: { type: String, required: true },
  storageKey: { type: String, required: true, select: false },
  imageName: { type: String, required: true },
  context: {
    condition: { type: String, default: '' },
    light: { type: String, default: '' },
    feelings: { type: [String], default: [] }
  },
  skinType: {
    type: { type: String, enum: ['油性皮肤', '干性皮肤', '中性皮肤', '混合性皮肤'], required: true },
    subtype: { type: String, enum: ['混油性', '混干性', '正常'], default: '正常' },
    basis: { type: String, required: true }
  },
  blackheads: {
    exists: { type: Boolean, required: true },
    severity: { type: String, enum: ['无', '少量', '中度', '大量'], required: true },
    distribution: { type: [String], default: [] }
  },
  acne: {
    exists: { type: Boolean, required: true },
    count: { type: String, enum: ['无', '少量', '中度', '大量'], required: true },
    types: { type: [String], default: [] },
    activity: { type: String, enum: ['不活跃', '轻度活跃', '中度活跃', '高度活跃'], default: '不活跃' },
    distribution: { type: [String], default: [] }
  },
  pores: {
    enlarged: { type: Boolean, required: true },
    severity: { type: String, enum: ['正常', '轻度', '中度', '严重'], required: true },
    distribution: { type: [String], default: [] }
  },
  otherIssues: { type: mongoose.Schema.Types.Mixed, default: {} },
  overallAssessment: {
    healthScore: { type: Number, min: 0, max: 100, required: true },
    summary: { type: String, required: true },
    recommendations: { type: [String], default: [] },
    skinCondition: {
      type: String,
      enum: ['优秀', '良好', '一般', '需要改善', '需要专业护理'],
      required: true
    }
  },
  moisture: Number,
  glossiness: Number,
  elasticity: Number,
  problemAreaScore: Number,
  rawAnalysisResult: { type: String, required: true, select: false },
  analysisConfig: { type: analysisConfigSchema, required: true }
}, { timestamps: true });

skinAnalysisSchema.index({ createdBy: 1, createdAt: -1 });

module.exports = mongoose.models.SkinAnalysis || mongoose.model('SkinAnalysis', skinAnalysisSchema);
