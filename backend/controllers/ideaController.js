const Idea = require('../models/ideaModel');

// 创建新反馈
const createIdea = async (req, res) => {
  try {
    console.log('接收到创建反馈请求');
    const { title, content, category } = req.body;

    // 验证请求
    if (!title || !content) {
      return res.status(400).json({
        success: false,
        message: '请提供标题和内容'
      });
    }

    // 创建反馈
    const idea = await Idea.create({
      title,
      content,
      category: category || '其他',
      createdBy: req.user._id
    });

    console.log(`反馈创建成功: ${idea._id}`);

    res.status(201).json({
      success: true,
      message: '反馈提交成功',
      data: {
        idea
      }
    });
  } catch (error) {
    console.error('创建反馈失败:', error);
    res.status(500).json({
      success: false,
      message: '创建反馈失败',
      error: error.message
    });
  }
};

// 获取用户的所有反馈
const getUserIdeas = async (req, res) => {
  try {
    console.log('接收到获取用户反馈列表请求');
    
    const ideas = await Idea.find({ createdBy: req.user._id })
      .sort({ createdAt: -1 });
    
    console.log(`获取到${ideas.length}条反馈记录`);
    
    res.status(200).json({
      success: true,
      count: ideas.length,
      data: {
        ideas
      }
    });
  } catch (error) {
    console.error('获取用户反馈列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取用户反馈列表失败',
      error: error.message
    });
  }
};

// 获取单个反馈详情
const getIdea = async (req, res) => {
  try {
    console.log('接收到获取反馈详情请求');
    
    const { id } = req.params;
    
    // 查找反馈
    const idea = await Idea.findById(id);
    
    if (!idea) {
      return res.status(404).json({
        success: false,
        message: '反馈不存在'
      });
    }
    
    // 验证所有权
    if (idea.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: '没有权限查看此反馈'
      });
    }
    
    console.log(`获取到反馈: ${idea._id}`);
    
    res.status(200).json({
      success: true,
      data: {
        idea
      }
    });
  } catch (error) {
    console.error('获取反馈详情失败:', error);
    res.status(500).json({
      success: false,
      message: '获取反馈详情失败',
      error: error.message
    });
  }
};

// 更新反馈
const updateIdea = async (req, res) => {
  try {
    console.log('接收到更新反馈请求');
    
    const { id } = req.params;
    const { title, content, category } = req.body;
    
    // 查找反馈
    let idea = await Idea.findById(id);
    
    if (!idea) {
      return res.status(404).json({
        success: false,
        message: '反馈不存在'
      });
    }
    
    // 验证所有权
    if (idea.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: '没有权限修改此反馈'
      });
    }
    
    // 更新字段
    idea.title = title || idea.title;
    idea.content = content || idea.content;
    if (category) idea.category = category;
    
    await idea.save();
    
    console.log(`反馈更新成功: ${idea._id}`);
    
    res.status(200).json({
      success: true,
      message: '反馈更新成功',
      data: {
        idea
      }
    });
  } catch (error) {
    console.error('更新反馈失败:', error);
    res.status(500).json({
      success: false,
      message: '更新反馈失败',
      error: error.message
    });
  }
};

// 删除反馈
const deleteIdea = async (req, res) => {
  try {
    console.log('接收到删除反馈请求');
    
    const { id } = req.params;
    
    // 查找反馈
    const idea = await Idea.findById(id);
    
    if (!idea) {
      return res.status(404).json({
        success: false,
        message: '反馈不存在'
      });
    }
    
    // 验证所有权
    if (idea.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: '没有权限删除此反馈'
      });
    }
    
    await Idea.deleteOne({ _id: id });
    
    console.log(`反馈删除成功: ${id}`);
    
    res.status(200).json({
      success: true,
      message: '反馈删除成功',
      data: {}
    });
  } catch (error) {
    console.error('删除反馈失败:', error);
    res.status(500).json({
      success: false,
      message: '删除反馈失败',
      error: error.message
    });
  }
};

module.exports = {
  createIdea,
  getUserIdeas,
  getIdea,
  updateIdea,
  deleteIdea
}; 