const mongoose = require('mongoose');

const ideaSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, '请提供反馈标题'],
    trim: true
  },
  content: {
    type: String,
    required: [true, '请提供反馈内容'],
    trim: true
  },
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

const Idea = mongoose.model('Idea', ideaSchema);

module.exports = Idea; 