const mongoose = require('mongoose');

const conflictSchema = new mongoose.Schema({
  products: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true }],
  productSnapshots: [{
    _id: { type: mongoose.Schema.Types.ObjectId, required: true },
    name: String, description: String, ingredients: [String], label: String
  }],
  reportVersion: Number,
  riskScore: { type: Number, min: 0, max: 5 },
  summary: String,
  productPairs: { type: [{
    _id: false, productIds: [String],
    status: { type: String, enum: ['compatible', 'caution', 'avoid', 'unknown'] },
    explanation: String
  }], default: undefined },
  // Read compatibility for previously saved reports only.
  conflicts: [{
    components: [String],
    severity: { type: String, enum: ['高', '中', '低'], required: true },
    description: String,
    effects: [String]
  }],
  safeCombo: [{ components: [String], description: String }],
  recommendations: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true }
}, { timestamps: true });

module.exports = mongoose.models.Conflict || mongoose.model('Conflict', conflictSchema);
