const mongoose = require('mongoose');

const ideaSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  content: { type: String, required: true, trim: true },
  category: {
    type: String,
    enum: ['功能建议', '问题反馈', '界面优化', '产品需求', '其他'],
    default: '其他'
  },
  status: {
    type: String,
    enum: ['待处理', '处理中', '已完成', '已拒绝'],
    default: '待处理'
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true }
}, { timestamps: true });

module.exports = mongoose.models.Idea || mongoose.model('Idea', ideaSchema);
