const mongoose = require('mongoose');

const conflictSchema = new mongoose.Schema({
  products: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  }],
  conflicts: [{
    components: [String],
    severity: {
      type: String,
      enum: ['高', '中', '低'],
      required: true
    },
    description: String,
    effects: [String]
  }],
  safeCombo: [{
    components: [String],
    description: String
  }],
  recommendations: {
    productPairings: {
      cannotUseTogether: [{
        products: [String],
        reason: String
      }],
      canUseTogether: [{
        products: [String],
        reason: String
      }]
    },
    routines: {
      morning: [String],
      evening: [String]
    }
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

const Conflict = mongoose.model('Conflict', conflictSchema);

module.exports = Conflict; 