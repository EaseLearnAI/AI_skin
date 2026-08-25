const mongoose = require('mongoose');

const conflictSchema = new mongoose.Schema({
  products: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true }],
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
