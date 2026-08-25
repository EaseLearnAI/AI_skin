const Idea = require('../models/idea.model');
const { ApiError } = require('../middlewares/error');

const createIdeaService = () => {
  const owned = async (userId, id) => {
    const idea = await Idea.findOne({ _id: id, createdBy: userId });
    if (!idea) throw new ApiError(404, '反馈不存在', 'IDEA_NOT_FOUND');
    return idea;
  };
  return {
    create: (userId, input) => Idea.create({ ...input, category: input.category || '其他', createdBy: userId }),
    list: (userId) => Idea.find({ createdBy: userId }).sort({ createdAt: -1 }),
    get: (userId, id) => owned(userId, id),
    async update(userId, id, input) {
      const idea = await owned(userId, id);
      for (const field of ['title', 'content', 'category']) {
        if (input[field] !== undefined) idea[field] = input[field];
      }
      await idea.save();
      return idea;
    },
    async remove(userId, id) {
      const idea = await owned(userId, id);
      await Idea.deleteOne({ _id: idea._id });
    }
  };
};

module.exports = { createIdeaService };
