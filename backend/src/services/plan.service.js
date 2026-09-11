const Plan = require('../models/plan.model');
const Product = require('../models/product.model');
const SkinAnalysis = require('../models/skinAnalysis.model');
const DailyRoutine = require('../models/dailyRoutine.model');
const User = require('../models/user.model');
const { ApiError } = require('../middlewares/error');

const createPlanService = ({ aiProvider }) => {
  const owned = async (userId, id) => {
    const plan = await Plan.findOne({ _id: id, createdBy: userId });
    if (!plan) throw new ApiError(404, '未找到护肤方案', 'PLAN_NOT_FOUND');
    return plan;
  };
  const initializeActive = async (userId) => {
    const user = await User.findById(userId).select('+activePlanId');
    if (user.activePlanId === undefined) {
      const legacy = await Plan.findOne({ createdBy: userId }).sort({ createdAt: -1, _id: -1 });
      await User.updateOne({ _id: userId, activePlanId: { $exists: false } },
        { $set: { activePlanId: legacy?._id || null } });
    }
  };
  const dailyView = (plan, input, record) => {
    if (record && record.timezone !== input.timezone) {
      throw new ApiError(409, '该日期已有其他时区的记录，请使用原时区', 'DAILY_TIMEZONE_CONFLICT');
    }
    const items = (period) => plan[period].map(({ step }) => ({ step,
      completed: record?.steps?.get(`${period}_${step}`) === true }));
    const morning = items('morning');
    const evening = items('evening');
    return { planId: plan._id, date: input.date, timezone: record?.timezone || input.timezone,
      morning, evening, completedCount: [...morning, ...evening].filter((s) => s.completed).length,
      totalCount: morning.length + evening.length };
  };
  return {
    async getActive(userId) {
      await initializeActive(userId);
      const user = await User.findById(userId).select('+activePlanId');
      if (!user.activePlanId) return null;
      const plan = await Plan.findOne({ _id: user.activePlanId, createdBy: userId });
      if (!plan) await User.updateOne({ _id: userId, activePlanId: user.activePlanId }, { $set: { activePlanId: null } });
      return plan;
    },
    async setActive(userId, planId) {
      const plan = planId ? await owned(userId, planId) : null;
      await User.updateOne({ _id: userId }, { $set: { activePlanId: plan?._id || null } });
      return plan;
    },
    async getDaily(userId, id, input) {
      const plan = await owned(userId, id);
      const record = await DailyRoutine.findOne({ createdBy: userId, planId: id, date: input.date });
      return dailyView(plan, input, record);
    },
    async updateDailyStep(userId, id, input) {
      const plan = await owned(userId, id);
      if (!plan[input.period].some((entry) => entry.step === input.step)) {
        throw new ApiError(404, '未找到指定护肤步骤', 'PLAN_STEP_NOT_FOUND');
      }
      const key = { createdBy: userId, planId: id, date: input.date };
      // Insert once, then atomically set one step; concurrent writes to other steps survive.
      try {
        await DailyRoutine.updateOne(key, { $setOnInsert: { ...key, timezone: input.timezone } }, { upsert: true });
      } catch (error) {
        if (error.code !== 11000) throw error;
      }
      const record = await DailyRoutine.findOneAndUpdate({ ...key, timezone: input.timezone },
        { $set: { [`steps.${input.period}_${input.step}`]: input.completed } }, { returnDocument: 'after' });
      if (!record) throw new ApiError(409, '该日期已有其他时区的记录，请使用原时区', 'DAILY_TIMEZONE_CONFLICT');
      return dailyView(plan, input, record);
    },
    async generate(userId, input, requestId) {
      const [user, products, latestSkinAnalysis] = await Promise.all([
        User.findById(userId),
        Product.find({ createdBy: userId }),
        SkinAnalysis.findOne({ createdBy: userId }).sort({ createdAt: -1 })
      ]);
      if (!products.length) throw new ApiError(400, '未找到任何产品，无法生成护肤方案', 'PRODUCTS_REQUIRED');
      const userAge = input.userAge ?? input.age ?? user.age;
      const userGender = user.gender;
      await initializeActive(userId);
      const result = await aiProvider.generatePlan({
        requestId,
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
      await Promise.all([
        User.updateOne({ _id: userId, activePlanId: id }, { $set: { activePlanId: null } }),
        DailyRoutine.deleteMany({ createdBy: userId, planId: id })
      ]);
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
    async createCustom(userId, input) {
      await initializeActive(userId);
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
