const mongoose = require('mongoose');

const routineItemSchema = new mongoose.Schema({
  step: Number,
  product: String,
  reason: String,
  completed: { type: Boolean, default: false },
  done: { type: Boolean, default: false }
}, { _id: false });

const planSchema = new mongoose.Schema({
  name: { type: String, default: '日常护肤方案' },
  requirement: { type: String, default: '' },
  skinConcerns: { type: [String], default: [] },
  customRequirements: { type: String, default: '' },
  userAge: { type: Number, min: 13, max: 120 },
  userGender: { type: String, enum: ['male', 'female'] },
  skinAnalysisId: { type: mongoose.Schema.Types.ObjectId, ref: 'SkinAnalysis', default: null },
  menstrualCycleInfo: {
    isInCycle: Boolean,
    cycleDay: Number,
    cycleLength: Number
  },
  morning: { type: [routineItemSchema], default: [] },
  evening: { type: [routineItemSchema], default: [] },
  recommendations: { type: [String], default: [] },
  skinAnalysisSummary: { type: String, default: '' },
  tags: { type: [String], default: [] },
  creatorNote: String,
  notes: String,
  origin: { type: String, enum: ['ai', 'custom'], default: 'ai' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true }
}, { timestamps: true });

module.exports = mongoose.models.Plan || mongoose.model('Plan', planSchema);
