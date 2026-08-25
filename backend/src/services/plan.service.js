const Plan = require('../models/plan.model');
const Product = require('../models/product.model');
const SkinAnalysis = require('../models/skinAnalysis.model');
const User = require('../models/user.model');
const { ApiError } = require('../middlewares/error');

const createPlanService = ({ aiProvider }) => {
  const owned = async (userId, id) => {
    const plan = await Plan.findOne({ _id: id, createdBy: userId });
    if (!plan) throw new ApiError(404, '未找到护肤方案', 'PLAN_NOT_FOUND');
    return plan;
  };
  return {
    async generate(userId, input) {
      const [user, products, latestSkinAnalysis] = await Promise.all([
        User.findById(userId),
        Product.find({ createdBy: userId }),
        SkinAnalysis.findOne({ createdBy: userId }).sort({ createdAt: -1 })
      ]);
      if (!products.length) throw new ApiError(400, '未找到任何产品，无法生成护肤方案', 'PRODUCTS_REQUIRED');
      const userAge = input.userAge || input.age || user.age || 25;
      const userGender = user.gender || 'female';
      const result = await aiProvider.generatePlan({
        requirement: input.requirement,
        skinConcerns: input.skinConcerns || [],
        customRequirements: input.customRequirements,
        user: { age: userAge, gender: userGender, menstrualCycle: user.menstrualCycle },
        products: products.map((product) => ({
          name: product.name,
          description: product.description,
          ingredients: product.ingredients,
          label: product.label
        })),
        skinAnalysis: latestSkinAnalysis
      });
      return Plan.create({
        ...result,
        requirement: input.requirement || '',
        skinConcerns: input.skinConcerns || [],
        customRequirements: input.customRequirements || '',
        userAge,
        userGender,
        skinAnalysisId: latestSkinAnalysis?._id || null,
        menstrualCycleInfo: userGender === 'female' ? user.menstrualCycle : undefined,
        origin: 'ai',
        createdBy: userId
      });
    },
    list: (userId) => Plan.find({ createdBy: userId }).sort({ createdAt: -1 }),
    get: (userId, id) => owned(userId, id),
    async remove(userId, id) {
      const result = await Plan.deleteOne({ _id: id, createdBy: userId });
      if (!result.deletedCount) throw new ApiError(404, '未找到护肤方案', 'PLAN_NOT_FOUND');
    },
    async updateStep(userId, id, { period, step, completed }) {
      const plan = await owned(userId, id);
      const item = plan[period].find((entry) => entry.step === step);
      if (!item) throw new ApiError(404, '未找到指定护肤步骤', 'PLAN_STEP_NOT_FOUND');
      item.completed = completed;
      item.done = completed;
      await plan.save();
      return plan;
    },
    createCustom(userId, input) {
      return Plan.create({
        name: input.name,
        morning: input.morning,
        evening: input.evening,
        recommendations: input.recommendations || [],
        tags: input.tags || [],
        notes: input.notes,
        origin: 'custom',
        createdBy: userId
      });
    }
  };
};

module.exports = { createPlanService };
