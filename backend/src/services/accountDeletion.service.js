const Product = require('../models/product.model');
const Conflict = require('../models/conflict.model');
const Idea = require('../models/idea.model');
const Plan = require('../models/plan.model');
const SkinAnalysis = require('../models/skinAnalysis.model');

const createAccountDeletionService = ({ storageProvider }) => ({
  async deleteAll(userId) {
    const [products, analyses] = await Promise.all([
      Product.find({ createdBy: userId }).select('+storageKey'),
      SkinAnalysis.find({ createdBy: userId }).select('+storageKey')
    ]);
    const keys = [
      ...products.map((item) => item.storageKey),
      ...analyses.map((item) => item.storageKey)
    ].filter(Boolean);
    for (const key of keys) await storageProvider.deleteObject(key);

    await Promise.all([
      Conflict.deleteMany({ createdBy: userId }),
      Idea.deleteMany({ createdBy: userId }),
      Plan.deleteMany({ createdBy: userId }),
      SkinAnalysis.deleteMany({ createdBy: userId }),
      Product.deleteMany({ createdBy: userId })
    ]);
  }
});

module.exports = { createAccountDeletionService };
