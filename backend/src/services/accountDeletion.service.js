const Product = require('../models/product.model');
const Conflict = require('../models/conflict.model');
const Idea = require('../models/idea.model');
const DailyRoutine = require('../models/dailyRoutine.model');
const Plan = require('../models/plan.model');
const SkinAnalysis = require('../models/skinAnalysis.model');
const PaymentOrder = require('../models/paymentOrder.model');

const createAccountDeletionService = ({ storageProvider }) => ({
  async deleteAll(userId) {
    const [products, analyses] = await Promise.all([
      Product.find({ createdBy: userId }).select('+storageKey +pendingStorageKeys'),
      SkinAnalysis.find({ createdBy: userId }).select('+storageKey')
    ]);
    const keys = [
      ...products.flatMap((item) => [item.storageKey, ...(item.pendingStorageKeys || [])]),
      ...analyses.map((item) => item.storageKey)
    ].filter(Boolean);
    for (const key of new Set(keys)) await storageProvider.deleteObject(key);

    await Promise.all([
      PaymentOrder.updateMany({ owner: userId }, { $set: { owner: null, idempotencyKey: 'deleted-account' } }),
      Conflict.deleteMany({ createdBy: userId }),
      Idea.deleteMany({ createdBy: userId }),
      Plan.deleteMany({ createdBy: userId }),
      DailyRoutine.deleteMany({ createdBy: userId }),
      SkinAnalysis.deleteMany({ createdBy: userId }),
      Product.deleteMany({ createdBy: userId })
    ]);
  }
});

module.exports = { createAccountDeletionService };
