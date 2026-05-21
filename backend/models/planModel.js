const mongoose = require('mongoose');

const planSchema = new mongoose.Schema({
  name: {
    type: String,
    default: '日常护肤方案'
  },
  requirement: {
    type: String,
    default: ''
  },
  // 护肤需求
  skinConcerns: {
    type: [String],
    default: []
  },
  // 自定义需求
  customRequirements: {
    type: String,
    default: ''
  },
  // 用户年龄
  userAge: {
    type: Number,
    min: 13,
    max: 120
  },
  // 用户性别
  userGender: {
    type: String,
    enum: ['male', 'female']
  },
  // 关联的肌肤分析ID
  skinAnalysisId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SkinAnalysis',
    default: null
  },
  // 生理周期信息（生成方案时的快照）
  menstrualCycleInfo: {
    isInCycle: Boolean,
    cycleDay: Number,
    cycleLength: Number
  },
  morning: [{
    step: Number,
    product: String,
    reason: String // 使用理由
  }],
  evening: [{
    step: Number,
    product: String,
    reason: String // 使用理由
  }],
  recommendations: {
    type: Array,
    default: []
  },
  // 基于肌肤分析的总结
  skinAnalysisSummary: {
    type: String,
    default: ''
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

const Plan = mongoose.model('Plan', planSchema);

module.exports = Plan; 