const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  provider: { type: String, enum: ['alipay', 'apple'], required: true },
  environment: { type: String, enum: ['sandbox', 'production'], required: true },
  appId: { type: String, required: true },
  sellerId: { type: String, required: true },
  idempotencyKey: { type: String, required: true, select: false },
  outTradeNo: { type: String, required: true, unique: true },
  tradeNo: { type: String, default: null, select: false },
  productId: { type: String, required: true },
  subject: { type: String, required: true },
  amountFen: { type: Number, required: true, min: 1 },
  currency: { type: String, enum: ['CNY'], required: true },
  durationMonths: { type: Number, required: true, enum: [1, 12] },
  status: { type: String, enum: ['pending', 'paid', 'closed', 'refunded'], default: 'pending' },
  // Expired + signed "not found" is recoverable if a delayed real payment appears.
  closeReason: { type: String, enum: ['expired_not_found', 'provider_closed', null], default: null },
  refundAmountFen: { type: Number, default: 0, min: 0 },
  paidAt: { type: Date, default: null },
  expiresAt: { type: Date, required: true },
  lastVerifiedAt: { type: Date, default: null }
}, { timestamps: true });

schema.index({ owner: 1, provider: 1, environment: 1, appId: 1, idempotencyKey: 1 }, {
  unique: true, partialFilterExpression: { owner: { $type: 'objectId' } }
});
schema.index({ provider: 1, environment: 1, appId: 1, tradeNo: 1 }, {
  unique: true, partialFilterExpression: { tradeNo: { $type: 'string' } }
});
schema.index({ owner: 1, provider: 1, environment: 1, status: 1, paidAt: 1 });

module.exports = mongoose.model('PaymentOrder', schema);
