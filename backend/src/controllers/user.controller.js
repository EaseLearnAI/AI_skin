const User = require('../models/user.model');
const Idea = require('../models/idea.model');

const createUserController = (authService) => ({
  register: async (req, res) => {
    const result = await authService.registerPhone(req.body);
    res.status(201).json({ success: true, message: '用户注册成功', ...result, data: { user: result.user } });
  },
  login: async (req, res) => {
    const result = await authService.loginPhone(req.body);
    res.status(200).json({ success: true, message: '登录成功', ...result, data: { user: result.user } });
  },
  apple: async (req, res) => {
    const result = await authService.loginApple(req.body);
    res.status(200).json({ success: true, message: '登录成功', ...result, data: { user: result.user } });
  },
  linkApple: async (req, res) => {
    const user = await authService.linkApple(req.user._id, req.body);
    res.status(200).json({ success: true, message: 'Apple 账号绑定成功', data: { user } });
  },
  getMe: async (req, res) => {
    const user = await User.findById(req.user._id);
    res.status(200).json({ success: true, data: { user } });
  },
  updateUsername: async (req, res) => {
    const user = await User.findByIdAndUpdate(req.user._id, { name: req.body.name }, { returnDocument: 'after', runValidators: true });
    res.status(200).json({ success: true, message: '用户名更新成功', data: { user } });
  },
  updateGender: async (req, res) => {
    const user = await User.findByIdAndUpdate(req.user._id, { gender: req.body.gender }, { returnDocument: 'after', runValidators: true });
    res.status(200).json({ success: true, message: '性别更新成功', data: { user } });
  },
  updateAge: async (req, res) => {
    const user = await User.findByIdAndUpdate(req.user._id, { age: req.body.age }, { returnDocument: 'after', runValidators: true });
    res.status(200).json({ success: true, message: '年龄更新成功', data: { user } });
  },
  updateMenstrualCycle: async (req, res) => {
    if (req.user.gender !== 'female') {
      const { ApiError } = require('../middlewares/error');
      throw new ApiError(400, '只有女性用户可以设置生理周期信息', 'GENDER_NOT_SUPPORTED');
    }
    const update = { 'menstrualCycle.lastUpdated': new Date() };
    for (const field of ['isInCycle', 'cycleDay', 'cycleLength']) {
      if (req.body[field] !== undefined) update[`menstrualCycle.${field}`] = req.body[field];
    }
    const user = await User.findByIdAndUpdate(req.user._id, update, { returnDocument: 'after', runValidators: true });
    res.status(200).json({ success: true, message: '生理周期信息更新成功', data: { user } });
  },
  stats: async (req, res) => {
    const [ideasCount, ideaCategories, user] = await Promise.all([
      Idea.countDocuments({ createdBy: req.user._id }),
      Idea.aggregate([
        { $match: { createdBy: req.user._id } },
        { $group: { _id: '$category', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
      User.findById(req.user._id)
    ]);
    const accountAge = Math.floor((Date.now() - user.createdAt) / 86400000);
    res.status(200).json({ success: true, data: { stats: { ideasCount, ideaCategories, accountAge } } });
  },
  requestPasswordReset: async (req, res) => {
    const result = await authService.requestPasswordReset(req.body);
    res.status(200).json({ success: true, message: result.message });
  },
  confirmPasswordReset: async (req, res) => {
    await authService.confirmPasswordReset(req.body);
    res.status(200).json({ success: true, message: '密码重置成功' });
  },
  logout: async (req, res) => {
    await authService.logout(req.user._id);
    res.status(200).json({ success: true, message: '登出成功', data: null });
  },
  deleteAccount: async (req, res) => {
    await authService.deleteAccount(req.user._id);
    res.status(200).json({ success: true, message: '账号已删除', data: null });
  }
});

module.exports = { createUserController };
