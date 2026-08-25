const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: { type: String, default: '未命名产品', trim: true },
  description: { type: String, default: '' },
  imageUrl: { type: String, default: '' },
  storageKey: { type: String, default: '', select: false },
  ingredients: { type: [String], default: [] },
  label: { type: String, default: '' },
  openingDate: { type: Date, default: null },
  ingredientAnalysis: { type: mongoose.Schema.Types.Mixed, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true }
}, { timestamps: true });

module.exports = mongoose.models.Product || mongoose.model('Product', productSchema);
