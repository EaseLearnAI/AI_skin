const mongoose = require('mongoose');

const skinAnalysisSchema = new mongoose.Schema({
  // 关联用户
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // 原始图片信息
  imageUrl: {
    type: String,
    required: true
  },
  imageName: {
    type: String,
    required: true
  },
  
  // 皮肤类型分析
  skinType: {
    type: {
      type: String,
      enum: ['油性皮肤', '干性皮肤', '中性皮肤', '混合性皮肤'],
      required: true
    },
    subtype: {
      type: String,
      enum: ['混油性', '混干性', '正常'],
      default: '正常'
    },
    basis: {
      type: String,
      required: true // 判断依据
    }
  },
  
  // 黑头情况
  blackheads: {
    exists: {
      type: Boolean,
      required: true
    },
    severity: {
      type: String,
      enum: ['无', '少量', '中度', '大量'],
      required: true
    },
    distribution: {
      type: [String],
      default: [] // 分布区域
    }
  },
  
  // 痘痘情况
  acne: {
    exists: {
      type: Boolean,
      required: true
    },
    count: {
      type: String,
      enum: ['无', '少量', '中度', '大量'],
      required: true
    },
    types: {
      type: [String],
      default: [] // 痘痘类型：粉刺、丘疹、囊肿性痤疮等
    },
    activity: {
      type: String,
      enum: ['不活跃', '轻度活跃', '中度活跃', '高度活跃'],
      default: '不活跃'
    },
    distribution: {
      type: [String],
      default: [] // 分布区域
    }
  },
  
  // 毛孔粗大情况
  pores: {
    enlarged: {
      type: Boolean,
      required: true
    },
    severity: {
      type: String,
      enum: ['正常', '轻度', '中度', '严重'],
      required: true
    },
    distribution: {
      type: [String],
      default: [] // 主要分布区域
    }
  },
  
  // 其他皮肤问题
  otherIssues: {
    redness: {
      exists: Boolean,
      severity: String,
      distribution: [String]
    },
    hyperpigmentation: {
      exists: Boolean,
      types: [String], // 晒斑、痘印等
      distribution: [String]
    },
    fineLines: {
      exists: Boolean,
      severity: String,
      distribution: [String]
    },
    sensitivity: {
      exists: Boolean,
      signs: [String]
    },
    skinToneEvenness: {
      score: Number, // 1-10分
      description: String
    }
  },
  
  // 整体评估
  overallAssessment: {
    healthScore: {
      type: Number,
      min: 0,
      max: 100,
      required: true
    },
    summary: {
      type: String,
      required: true
    },
    recommendations: {
      type: [String],
      default: []
    },
    skinCondition: {
      type: String,
      enum: ['优秀', '良好', '一般', '需要改善', '需要专业护理'],
      required: true
    }
  },
  
  // AI分析原始结果
  rawAnalysisResult: {
    type: String,
    required: true
  },
  
  // 分析参数
  analysisConfig: {
    model: {
      type: String,
      default: 'qwen2.5-vl-72b-instruct'
    },
    analysisDate: {
      type: Date,
      default: Date.now
    },
    processingTime: Number // 处理时间（毫秒）
  }
}, {
  timestamps: true
});

// 创建索引
skinAnalysisSchema.index({ createdBy: 1, createdAt: -1 });
skinAnalysisSchema.index({ 'overallAssessment.healthScore': -1 });

const SkinAnalysis = mongoose.model('SkinAnalysis', skinAnalysisSchema);

module.exports = SkinAnalysis; 