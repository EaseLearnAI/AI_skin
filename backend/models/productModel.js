const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    default: '未命名产品'
  },
  description: {
    type: String,
    default: ''
  },
  imageUrl: {
    type: String,
    default: ''
  },
  ingredients: {
    type: Array,
    default: []
  },
  label: {
    type: String,
    default: ''
  },
  openingDate: {
    type: Date,
    default: null
  },
  ingredientAnalysis: {
    type: Object,
    default: null
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

const Product = mongoose.model('Product', productSchema);

module.exports = Product; 