const { createDashscopeProvider } = require('../../src/providers/ai/dashscopeProvider');

const response = (value) => ({
  data: { choices: [{ message: { content: typeof value === 'string' ? value : JSON.stringify(value) } }] }
});

describe('DashScope provider boundaries', () => {
  const config = {
    apiKey: 'test-key',
    baseURL: 'https://dashscope.example/v1',
    textModel: 'qwen3.7-flash',
    visionModel: 'qwen3-vl-plus',
    ocrModel: 'qwen-vl-ocr-latest',
    timeoutMs: 100000
  };

  test('routes plan generation to the text model with an explicit timeout', async () => {
    const logger = { info: jest.fn(), error: jest.fn() };
    const httpClient = { post: jest.fn(async () => response({
      name: '基础方案',
      morning: [{ step: 1, product: '洁面', reason: '清洁' }],
      evening: [],
      recommendations: ['防晒'],
      skinAnalysisSummary: '状态稳定'
    })) };
    const provider = createDashscopeProvider({ config, httpClient, logger });

    await expect(provider.generatePlan({ products: [], user: { age: 28, gender: 'female' } }))
      .resolves.toMatchObject({ name: '基础方案' });

    const [url, body, options] = httpClient.post.mock.calls[0];
    expect(url).toBe('https://dashscope.example/v1/chat/completions');
    expect(body.model).toBe('qwen3.7-flash');
    expect(options.timeout).toBe(100000);
    expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({
      event: 'ai_call', model: 'qwen3.7-flash', status: 'succeeded', durationMs: expect.any(Number)
    }));
  });

  test('routes OCR to its dedicated model and rejects a non-array ingredient result', async () => {
    const httpClient = { post: jest.fn(async () => response({ 产品名称: '精华', 产品成分: '烟酰胺' })) };
    const provider = createDashscopeProvider({ config, httpClient });

    await expect(provider.extractProductInfo({ imageUrl: 'signed://product' }))
      .rejects.toMatchObject({ statusCode: 502, code: 'AI_OUTPUT_INVALID' });
    expect(httpClient.post.mock.calls[0][1].model).toBe('qwen-vl-ocr-latest');
  });

  test('normalizes the observed OCR object-array response into individual ingredients', async () => {
    const httpClient = { post: jest.fn(async () => response({
      产品名称: '雅诗兰黛特润修护肌透精华露',
      产品成分: [{ 成分: '水、二裂酵母发酵产物溶胞物、甲基葡糖醇聚醚-20' }]
    })) };
    const provider = createDashscopeProvider({ config, httpClient });

    await expect(provider.extractProductInfo({ imageUrl: 'signed://real-product-fixture' }))
      .resolves.toMatchObject({
        productName: '雅诗兰黛特润修护肌透精华露',
        ingredients: ['水', '二裂酵母发酵产物溶胞物', '甲基葡糖醇聚醚-20']
      });
  });

  test('keeps commas inside a chemical ingredient name while normalizing OCR output', async () => {
    const httpClient = { post: jest.fn(async () => response({
      产品名称: '测试精华',
      产品成分: [{ 成分: '丁二醇、1,3-丙二醇、甘油' }]
    })) };
    const provider = createDashscopeProvider({ config, httpClient });

    await expect(provider.extractProductInfo({ imageUrl: 'signed://real-product-fixture' }))
      .resolves.toMatchObject({ ingredients: ['丁二醇', '1,3-丙二醇', '甘油'] });
  });

  test('normalizes the observed ingredient-analysis response without losing content', async () => {
    const httpClient = { post: jest.fn(async () => response({
      safetyIndex: 85,
      efficacyScore: 4,
      activeIngredients: ['二裂酵母发酵产物溶胞物', '角鲨烷', '透明质酸钠', '咖啡因'],
      acneRisk: { level: 'low', percentage: 5 },
      irritationRisk: { level: 'medium', percentage: 15 },
      allergyRisk: { level: 'low', percentage: 5 },
      efficacyAnalysis: '保湿与修护',
      potentialRisks: '敏感肌需要测试',
      recommendations: '建议晚间使用',
      overallRating: 4.5,
      summary: '配方整体温和'
    })) };
    const provider = createDashscopeProvider({ config, httpClient });

    await expect(provider.analyzeIngredients({ productName: '测试精华', ingredients: ['角鲨烷'] }))
      .resolves.toMatchObject({
        activeIngredients: 4,
        acneRisk: { level: '低', percentage: 5 },
        irritationRisk: { level: '中', percentage: 15 },
        efficacyAnalysis: ['保湿与修护'],
        potentialRisks: ['敏感肌需要测试'],
        recommendations: ['建议晚间使用']
      });
  });

  test('unwraps an observed single ingredient-analysis result array', async () => {
    const httpClient = { post: jest.fn(async () => response([{
      safetyIndex: 90,
      efficacyScore: 4,
      activeIngredients: 3,
      acneRisk: { level: '低', percentage: 5 },
      irritationRisk: { level: '低', percentage: 5 },
      allergyRisk: { level: '低', percentage: 5 },
      efficacyAnalysis: ['保湿'],
      potentialRisks: [],
      recommendations: ['晚间使用'],
      overallRating: 4,
      summary: '整体温和'
    }])) };
    const provider = createDashscopeProvider({ config, httpClient });

    await expect(provider.analyzeIngredients({ productName: '测试精华', ingredients: ['角鲨烷'] }))
      .resolves.toMatchObject({ safetyIndex: 90, activeIngredients: 3 });
  });

  test('normalizes the observed conflict response into the public API contract', async () => {
    const httpClient = { post: jest.fn(async () => response({
      conflicts: [{
        components: ['视黄醇', '烟酰胺'],
        severity: 'medium',
        description: '现代配方通常可以兼容',
        effects: '注意观察皮肤耐受度'
      }],
      safeCombo: [{ components: ['角鲨烷', '透明质酸钠'], description: '可以搭配' }],
      recommendations: {
        productPairings: {
          cannotUseTogether: [],
          canUseTogether: ['测试精华 + 维A醇晚霜']
        },
        routines: {
          morning: '温和洁面 -> 测试精华 -> 防晒',
          evening: '卸妆洁面 -> 维A醇晚霜'
        }
      }
    })) };
    const provider = createDashscopeProvider({ config, httpClient });

    await expect(provider.analyzeConflict({ products: [] })).resolves.toMatchObject({
      conflicts: [{ severity: '中', effects: ['注意观察皮肤耐受度'] }],
      recommendations: {
        productPairings: {
          canUseTogether: [{ products: ['测试精华', '维A醇晚霜'], reason: '' }]
        },
        routines: {
          morning: ['温和洁面', '测试精华', '防晒'],
          evening: ['卸妆洁面', '维A醇晚霜']
        }
      }
    });
  });

  test('preserves an observed structured plan summary in the string API field', async () => {
    const httpClient = { post: jest.fn(async () => response({
      name: '基础保湿修护方案',
      morning: [{ step: 1, product: '温和洁面', reason: '温和清洁' }],
      evening: [{ step: 1, product: '修护精华', reason: '夜间修护' }],
      recommendations: ['每日防晒'],
      skinAnalysisSummary: {
        skinType: '偏干性',
        barrierStatus: '轻度受损',
        keyNeeds: ['经皮水分流失防护', '角质层脂质补充']
      }
    })) };
    const provider = createDashscopeProvider({ config, httpClient });

    await expect(provider.generatePlan({ products: [], user: {} })).resolves.toMatchObject({
      skinAnalysisSummary: JSON.stringify({
        skinType: '偏干性',
        barrierStatus: '轻度受损',
        keyNeeds: ['经皮水分流失防护', '角质层脂质补充']
      })
    });
  });

  test('unwraps an observed single-plan top-level array', async () => {
    const httpClient = { post: jest.fn(async () => response([{
      name: '基础保湿修护早晚方案',
      morning: [{ step: 1, product: '温和洁面', reason: '温和清洁' }],
      evening: [{ step: 1, product: '修护精华', reason: '夜间修护' }],
      recommendations: ['每日防晒'],
      skinAnalysisSummary: '当前配置满足基础保湿修护需求'
    }])) };
    const provider = createDashscopeProvider({ config, httpClient });

    await expect(provider.generatePlan({ products: [], user: {} }))
      .resolves.toMatchObject({ name: '基础保湿修护早晚方案' });
  });

  test('normalizes the observed vision response while preserving the analysis', async () => {
    const httpClient = { post: jest.fn(async () => response({
      skinType: { type: '中性皮肤', subtype: '偏干', basis: '整体肤质细腻均匀' },
      blackheads: { exists: false, severity: '无', distribution: '' },
      acne: { exists: false, count: 0, types: [], activity: '无活动性炎症', distribution: '' },
      pores: { enlarged: false, severity: '轻微', distribution: '鼻翼区域偶见细微毛孔' },
      otherIssues: '无明显瑕疵',
      overallAssessment: {
        healthScore: 92,
        summary: '皮肤状态整体健康',
        recommendations: ['维持温和清洁与保湿'],
        skinCondition: '优秀'
      }
    })) };
    const provider = createDashscopeProvider({ config, httpClient });

    await expect(provider.analyzeSkin({ imageUrl: 'signed://real-face-fixture' }))
      .resolves.toMatchObject({
        data: {
          skinType: { subtype: '混干性' },
          blackheads: { distribution: [] },
          acne: { count: '无', activity: '不活跃', distribution: [] },
          pores: { severity: '轻度', distribution: ['鼻翼区域偶见细微毛孔'] },
          otherIssues: { description: '无明显瑕疵' },
          overallAssessment: { healthScore: 92 }
        }
      });
  });

  test('treats an observed empty other-issues array as no additional issues', async () => {
    const httpClient = { post: jest.fn(async () => response({
      skinType: { type: '中性皮肤', subtype: '偏干', basis: '整体肤质细腻均匀' },
      blackheads: { exists: false, severity: '无', distribution: '' },
      acne: { exists: false, count: 0, types: [], activity: '无活动性', distribution: '' },
      pores: { enlarged: false, severity: '正常', distribution: '' },
      otherIssues: [],
      overallAssessment: {
        healthScore: 92,
        summary: '皮肤状态整体健康',
        recommendations: ['维持温和清洁与保湿'],
        skinCondition: '良好'
      }
    })) };
    const provider = createDashscopeProvider({ config, httpClient });

    await expect(provider.analyzeSkin({ imageUrl: 'signed://real-face-fixture' }))
      .resolves.toMatchObject({ data: { otherIssues: {} } });
  });

  test('rejects incomplete skin analysis instead of fabricating health data', async () => {
    const httpClient = { post: jest.fn(async () => response({
      skinType: { type: '中性皮肤', subtype: '正常', basis: '观察结果' },
      blackheads: { exists: false, severity: '无', distribution: [] },
      acne: { exists: false, count: '无', types: [], activity: '不活跃', distribution: [] },
      pores: { enlarged: false, severity: '正常', distribution: [] },
      overallAssessment: { summary: '缺少健康分', recommendations: [], skinCondition: '一般' }
    })) };
    const provider = createDashscopeProvider({ config, httpClient });

    await expect(provider.analyzeSkin({ imageUrl: 'signed://face' }))
      .rejects.toMatchObject({ statusCode: 502, code: 'AI_OUTPUT_INVALID' });
    expect(httpClient.post.mock.calls[0][1].model).toBe('qwen3-vl-plus');
  });

  test('does not accept markdown or prose around JSON', async () => {
    const httpClient = { post: jest.fn(async () => response('```json\n{"name":"方案"}\n```')) };
    const provider = createDashscopeProvider({ config, httpClient });

    await expect(provider.generatePlan({ products: [], user: {} }))
      .rejects.toMatchObject({ code: 'AI_OUTPUT_INVALID' });
  });

  test('logs only structural validation details for invalid AI output', async () => {
    const logger = { info: jest.fn(), error: jest.fn() };
    const httpClient = { post: jest.fn(async () => response({
      safetyIndex: 85,
      efficacyScore: 4,
      activeIngredients: 2,
      acneRisk: { level: 'unexpected', percentage: 5 },
      irritationRisk: { level: '低', percentage: 5 },
      allergyRisk: { level: '低', percentage: 5 },
      efficacyAnalysis: ['保湿'],
      potentialRisks: [],
      recommendations: ['晚间使用'],
      overallRating: 4,
      summary: '测试'
    })) };
    const provider = createDashscopeProvider({ config, httpClient, logger });

    await expect(provider.analyzeIngredients({ productName: '测试', ingredients: ['水'] }))
      .rejects.toMatchObject({ code: 'AI_OUTPUT_INVALID' });
    expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({
      event: 'ai_output_invalid',
      model: 'qwen3.7-flash',
      validationErrors: expect.arrayContaining([
        expect.objectContaining({ path: 'acneRisk.level', type: 'any.only', value: 'unexpected' })
      ])
    }));
  });
});
