const mongoose = require('mongoose');
const { analysisConfigSchema } = require('./schemas/analysisConfig.schema');

const productSchema = new mongoose.Schema({
  name: { type: String, default: '未命名产品', trim: true },
  description: { type: String, default: '' },
  imageUrl: { type: String, default: '' },
  storageKey: { type: String, default: '', select: false },
  pendingStorageKeys: { type: [String], default: [], select: false },
  ingredients: { type: [String], default: [] },
  label: { type: String, default: '' },
  openingStatus: { type: String, enum: ['unknown', 'unopened', 'opened'] },
  openingDate: { type: Date, default: null },
  ingredientAnalysis: { type: mongoose.Schema.Types.Mixed, default: null },
  ocrConfig: { type: analysisConfigSchema, default: undefined },
  rawOcrResult: { type: String, select: false },
  ingredientAnalysisConfig: { type: analysisConfigSchema, default: undefined },
  rawIngredientAnalysisResult: { type: String, select: false },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true }
}, { timestamps: true });

module.exports = mongoose.models.Product || mongoose.model('Product', productSchema);
