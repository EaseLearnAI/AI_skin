const SkinAnalysis = require('../models/skinAnalysisModel');
const { uploadToOSS } = require('../utils/ossUtils');
const { analyzeSkinCondition, validateAnalysisResult } = require('../utils/skinAnalysisUtils');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// 配置multer用于文件上传
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = 'uploads/skin-analysis/';
    
    // 确保目录存在
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  // 检查文件类型
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('只允许上传图片文件'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB 限制
  }
}).single('faceImage');

/**
 * 上传并分析皮肤状态
 */
const uploadAndAnalyzeSkin = async (req, res) => {
  console.log('\n' + '='.repeat(60));
  console.log('🎯 开始皮肤状态分析流程');
  console.log('👤 用户ID:', req.user.id);
  
  try {
    // 处理文件上传
    upload(req, res, async function (err) {
      if (err instanceof multer.MulterError) {
        console.error('❌ 文件上传错误:', err.message);
        return res.status(400).json({
          success: false,
          message: '文件上传失败: ' + err.message
        });
      } else if (err) {
        console.error('❌ 上传处理错误:', err.message);
        return res.status(400).json({
          success: false,
          message: err.message
        });
      }

      if (!req.file) {
        console.error('❌ 未找到上传文件');
        return res.status(400).json({
          success: false,
          message: '请上传面部图片'
        });
      }

      console.log('📁 文件上传成功:', req.file.filename);
      console.log('📄 文件信息:', {
        originalName: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype
      });

      try {
        // 上传图片到OSS
        console.log('☁️ 开始上传到OSS...');
        const ossResult = await uploadToOSS(req.file.path, req.file.filename);
        
        if (!ossResult.success) {
          console.error('❌ OSS上传失败:', ossResult.error);
          // 清理本地文件
          fs.unlinkSync(req.file.path);
          return res.status(500).json({
            success: false,
            message: 'OSS上传失败: ' + ossResult.error
          });
        }

        console.log('✅ OSS上传成功:', ossResult.url);

        // 调用AI模型分析皮肤状态
        console.log('🤖 开始AI皮肤分析...');
        const analysisResult = await analyzeSkinCondition(ossResult.url);

        if (!analysisResult.success) {
          console.error('❌ AI分析失败:', analysisResult.error);
          return res.status(500).json({
            success: false,
            message: 'AI分析失败: ' + analysisResult.error
          });
        }

        console.log('✅ AI分析完成');

        // 验证分析结果
        if (!validateAnalysisResult(analysisResult.data)) {
          console.error('❌ 分析结果格式不正确');
          return res.status(500).json({
            success: false,
            message: '分析结果格式不正确，请重试'
          });
        }

        // 保存分析结果到数据库
        console.log('💾 保存分析结果到数据库...');
        const skinAnalysisData = {
          createdBy: req.user.id,
          imageUrl: ossResult.url,
          imageName: req.file.originalname,
          skinType: analysisResult.data.skinType,
          blackheads: analysisResult.data.blackheads,
          acne: analysisResult.data.acne,
          pores: analysisResult.data.pores,
          otherIssues: analysisResult.data.otherIssues,
          overallAssessment: analysisResult.data.overallAssessment,
          rawAnalysisResult: analysisResult.rawContent,
          analysisConfig: {
            model: 'qwen2.5-vl-72b-instruct',
            analysisDate: new Date(),
            processingTime: analysisResult.processingTime
          }
        };

        const skinAnalysis = new SkinAnalysis(skinAnalysisData);
        await skinAnalysis.save();

        console.log('✅ 分析结果已保存，ID:', skinAnalysis._id);

        // 清理本地文件
        fs.unlinkSync(req.file.path);
        console.log('🗑️ 本地临时文件已清理');

        console.log('🎉 皮肤分析流程完成');
        console.log('='.repeat(60));

        // 返回结果
        res.status(201).json({
          success: true,
          message: '皮肤状态分析完成',
          data: {
            analysisId: skinAnalysis._id,
            imageUrl: ossResult.url,
            skinType: analysisResult.data.skinType,
            blackheads: analysisResult.data.blackheads,
            acne: analysisResult.data.acne,
            pores: analysisResult.data.pores,
            otherIssues: analysisResult.data.otherIssues,
            overallAssessment: analysisResult.data.overallAssessment,
            analysisConfig: skinAnalysisData.analysisConfig
          }
        });

      } catch (error) {
        console.error('❌ 处理过程中发生错误:', error);
        
        // 清理本地文件
        if (req.file && fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }

        res.status(500).json({
          success: false,
          message: '处理过程中发生错误: ' + error.message
        });
      }
    });

  } catch (error) {
    console.error('❌ 皮肤分析控制器错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器内部错误: ' + error.message
    });
  }
};

/**
 * 获取用户的皮肤分析历史记录
 */
const getUserSkinAnalyses = async (req, res) => {
  console.log('📊 获取用户皮肤分析历史记录');
  console.log('👤 用户ID:', req.user.id);

  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    console.log('📄 分页参数:', { page, limit, skip });

    // 查询用户的分析记录
    const analyses = await SkinAnalysis.find({ createdBy: req.user.id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('-rawAnalysisResult') // 不返回原始分析结果以减少数据量
      .populate('createdBy', 'name email');

    // 统计总数
    const total = await SkinAnalysis.countDocuments({ createdBy: req.user.id });

    console.log('✅ 查询完成，找到', analyses.length, '条记录，总计', total, '条');

    res.json({
      success: true,
      data: {
        analyses: analyses,
        pagination: {
          page: page,
          limit: limit,
          total: total,
          pages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    console.error('❌ 获取分析记录失败:', error);
    res.status(500).json({
      success: false,
      message: '获取分析记录失败: ' + error.message
    });
  }
};

/**
 * 获取单个皮肤分析详情
 */
const getSkinAnalysisDetail = async (req, res) => {
  console.log('🔍 获取皮肤分析详情');
  console.log('📋 分析ID:', req.params.id);
  console.log('👤 用户ID:', req.user.id);

  try {
    const analysis = await SkinAnalysis.findOne({
      _id: req.params.id,
      createdBy: req.user.id
    }).populate('createdBy', 'name email');

    if (!analysis) {
      console.log('❌ 未找到分析记录');
      return res.status(404).json({
        success: false,
        message: '未找到该分析记录'
      });
    }

    console.log('✅ 分析记录获取成功');

    res.json({
      success: true,
      data: {
        analysis: analysis
      }
    });

  } catch (error) {
    console.error('❌ 获取分析详情失败:', error);
    res.status(500).json({
      success: false,
      message: '获取分析详情失败: ' + error.message
    });
  }
};

/**
 * 删除皮肤分析记录
 */
const deleteSkinAnalysis = async (req, res) => {
  console.log('🗑️ 删除皮肤分析记录');
  console.log('📋 分析ID:', req.params.id);
  console.log('👤 用户ID:', req.user.id);

  try {
    const analysis = await SkinAnalysis.findOneAndDelete({
      _id: req.params.id,
      createdBy: req.user.id
    });

    if (!analysis) {
      console.log('❌ 未找到要删除的分析记录');
      return res.status(404).json({
        success: false,
        message: '未找到该分析记录'
      });
    }

    console.log('✅ 分析记录删除成功');

    res.json({
      success: true,
      message: '分析记录删除成功',
      data: {}
    });

  } catch (error) {
    console.error('❌ 删除分析记录失败:', error);
    res.status(500).json({
      success: false,
      message: '删除分析记录失败: ' + error.message
    });
  }
};

/**
 * 获取用户皮肤分析统计数据
 */
const getSkinAnalysisStats = async (req, res) => {
  console.log('📈 获取用户皮肤分析统计数据');
  console.log('👤 用户ID:', req.user.id);

  try {
    // 获取基础统计
    const totalAnalyses = await SkinAnalysis.countDocuments({ createdBy: req.user.id });
    
    // 获取最近的分析记录
    const latestAnalysis = await SkinAnalysis.findOne({ createdBy: req.user.id })
      .sort({ createdAt: -1 });

    // 皮肤类型分布统计
    const skinTypeStats = await SkinAnalysis.aggregate([
      { $match: { createdBy: req.user.id } },
      { $group: { _id: '$skinType.type', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    // 健康评分趋势（最近10次）
    const healthScoreTrend = await SkinAnalysis.find({ createdBy: req.user.id })
      .sort({ createdAt: -1 })
      .limit(10)
      .select('overallAssessment.healthScore createdAt')
      .lean();

    // 平均健康评分
    const avgHealthScore = await SkinAnalysis.aggregate([
      { $match: { createdBy: req.user.id } },
      { $group: { _id: null, avgScore: { $avg: '$overallAssessment.healthScore' } } }
    ]);

    console.log('✅ 统计数据计算完成');

    res.json({
      success: true,
      data: {
        stats: {
          totalAnalyses: totalAnalyses,
          latestAnalysisDate: latestAnalysis ? latestAnalysis.createdAt : null,
          averageHealthScore: avgHealthScore.length > 0 ? Math.round(avgHealthScore[0].avgScore) : 0,
          skinTypeDistribution: skinTypeStats,
          healthScoreTrend: healthScoreTrend.reverse(), // 按时间正序排列
          latestSkinCondition: latestAnalysis ? latestAnalysis.overallAssessment.skinCondition : null
        }
      }
    });

  } catch (error) {
    console.error('❌ 获取统计数据失败:', error);
    res.status(500).json({
      success: false,
      message: '获取统计数据失败: ' + error.message
    });
  }
};

/**
 * 获取用户最新的皮肤分析
 */
const getLatestSkinAnalysis = async (req, res) => {
  console.log('🔍 获取用户最新皮肤分析');
  console.log('👤 用户ID:', req.user.id);

  try {
    const latestAnalysis = await SkinAnalysis.findOne({ createdBy: req.user.id })
      .sort({ createdAt: -1 })
      .populate('createdBy', 'name email');

    if (!latestAnalysis) {
      console.log('❌ 未找到任何分析记录');
      return res.status(404).json({
        success: false,
        message: '暂无皮肤分析记录，请先进行皮肤检测'
      });
    }

    console.log('✅ 最新分析记录获取成功，分析时间:', latestAnalysis.createdAt);

    res.json({
      success: true,
      data: {
        analysis: latestAnalysis
      }
    });

  } catch (error) {
    console.error('❌ 获取最新分析失败:', error);
    res.status(500).json({
      success: false,
      message: '获取最新分析失败: ' + error.message
    });
  }
};

module.exports = {
  uploadAndAnalyzeSkin,
  getUserSkinAnalyses,
  getSkinAnalysisDetail,
  deleteSkinAnalysis,
  getSkinAnalysisStats,
  getLatestSkinAnalysis
}; 