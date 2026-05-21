require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const morgan = require('morgan');
const config = require('./config/config');

// Import routes
const userRoutes = require('./routes/userRoutes');
const productRoutes = require('./routes/productRoutes');
const ingredientAnalysisRoutes = require('./routes/ingredientAnalysisRoutes');
const conflictRoutes = require('./routes/conflictRoutes');
const planRoutes = require('./routes/planRoutes');
const ideaRoutes = require('./routes/ideaRoutes');
const skinAnalysisRoutes = require('./routes/skinAnalysisRoutes');

// Create Express app
const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(morgan('dev'));

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/aiskin', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('Failed to connect to MongoDB:', err));

// Routes
app.use('/api/users', userRoutes);
app.use('/api/products', productRoutes);
app.use('/api/products', ingredientAnalysisRoutes);
app.use('/api/conflicts', conflictRoutes);
app.use('/api/plans', planRoutes);
app.use('/api/ideas', ideaRoutes);
app.use('/api/skin-analysis', skinAnalysisRoutes);

// Home route
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to AI Skincare System API - 皮肤分析功能已启用' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'An error occurred',
    error: process.env.NODE_ENV === 'production' ? {} : err
  });
});

// Start server
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('✅ 皮肤分析功能已启用');
  console.log('📋 可用的皮肤分析接口:');
  console.log('  POST /api/skin-analysis/analyze - 上传并分析皮肤');
  console.log('  GET  /api/skin-analysis - 获取分析历史');
  console.log('  GET  /api/skin-analysis/stats - 获取统计数据');
  console.log('  GET  /api/skin-analysis/:id - 获取分析详情');
  console.log('  DELETE /api/skin-analysis/:id - 删除分析记录');
});

// For testing purposes
module.exports = server; 