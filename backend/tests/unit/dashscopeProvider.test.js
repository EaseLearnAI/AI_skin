const { conflictReport } = require('../fixtures/conflictReport');
const { createDashscopeProvider } = require('../../src/providers/ai/dashscopeProvider');
const {
  productOcrPrompt, ingredientPrompt, conflictPrompt, planPrompt, skinPrompt
} = require('../../src/prompts');

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

  const taskCases = [
    {
      task: 'ocr', method: 'extractProductInfo', modelKey: 'ocrModel',
      promptVersion: 'ocr-v2-visible-label', schemaVersion: 'ocr-v1',
      input: { imageUrl: 'signed://task-product' },
      payload: { 产品名称: '测试产品', 产品成分: ['水', '甘油'] },
      content: () => [
        { type: 'text', text: productOcrPrompt() },
        { type: 'image_url', image_url: { url: 'signed://task-product' } }
      ],
      resultKeys: ['productName', 'ingredients', 'rawContent', 'analysisConfig']
    },
    {
      task: 'ingredients', method: 'analyzeIngredients', modelKey: 'textModel',
      promptVersion: 'ingredients-v4-concise-reading', schemaVersion: 'ingredients-v2-concise-reading',
      input: { productName: '测试产品', ingredients: ['水', '甘油'] },
      payload: {
        safetyIndex: 85, efficacyScore: 4, activeIngredients: 1,
        acneRisk: { level: '低', percentage: 5 }, irritationRisk: { level: '低', percentage: 5 },
        allergyRisk: { level: '低', percentage: 5 }, efficacyAnalysis: ['保湿支持：可能帮助维持水分。'], potentialRisks: ['个体反应：敏感肌需留意耐受。'],
        recommendations: ['观察耐受：不适时暂停使用。'], overallRating: 4, summary: '标签模型估计'
      },
      content: ingredientPrompt,
      metadata: true
    },
    {
      task: 'conflict', method: 'analyzeConflict', modelKey: 'textModel',
      promptVersion: 'conflict-v4-product-assessment', schemaVersion: 'conflict-v2-product-report',
      input: { products: [{ id: 'a', name: '精华', ingredients: ['水'] }, { id: 'b', name: '乳霜', ingredients: ['甘油'] }] },
      payload: conflictReport([{ id: 'a' }, { id: 'b' }]),
      content: conflictPrompt
    },
    {
      task: 'plan', method: 'generatePlan', modelKey: 'textModel',
      promptVersion: 'plan-v3-no-demographic-defaults', schemaVersion: 'plan-v1',
      input: { products: [{ name: '测试产品', label: '面霜' }], user: {} },
      payload: {
        name: '基础方案', morning: [{ step: 1, product: '测试产品', reason: '保湿' }],
        evening: [], recommendations: ['观察耐受：不适时暂停使用。'], skinAnalysisSummary: '未提供肤况'
      },
      content: planPrompt
    },
    {
      task: 'skin', method: 'analyzeSkin', modelKey: 'visionModel',
      promptVersion: 'skin-v5-photo-estimation', schemaVersion: 'skin-v2-other-issues',
      input: { imageUrl: 'signed://task-face' },
      payload: {
        skinType: { type: '混合性皮肤', subtype: '混油性', basis: '照片外观估计' },
        blackheads: { exists: false, severity: '无', distribution: [] },
        acne: { exists: false, count: '无', types: [], activity: '不活跃', distribution: [] },
        pores: { enlarged: false, severity: '正常', distribution: [] },
        otherIssues: {},
        overallAssessment: {
          healthScore: 80, summary: '照片模型估计', recommendations: [], skinCondition: '良好'
        }
      },
      content: () => [
        { type: 'image_url', image_url: { url: 'signed://task-face' } },
        { type: 'text', text: skinPrompt() }
      ],
      resultKeys: ['data', 'rawContent', 'processingTime', 'model', 'promptVersion', 'schemaVersion', 'analysisConfig']
    }
  ];

  test.each(taskCases)('$task retains its request, result and trace contract through the shared executor', async (task) => {
    const logger = { info: jest.fn(), error: jest.fn() };
    const httpClient = { post: jest.fn(async () => response(task.payload)) };
    const provider = createDashscopeProvider({ config, httpClient, logger });
    const requestId = `request-${task.task}`;
    const result = await provider[task.method]({ ...task.input, requestId });

    expect(httpClient.post).toHaveBeenCalledTimes(1);
    expect(httpClient.post).toHaveBeenCalledWith(`${config.baseURL}/chat/completions`, {
      model: config[task.modelKey],
      messages: [{ role: 'user', content: task.content(task.input) }],
      response_format: { type: 'json_object' }
    }, {
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
      timeout: config.timeoutMs
    });
    const expectedKeys = task.resultKeys || [
      ...Object.keys(task.payload), ...(task.metadata ? ['rawContent', 'analysisConfig'] : [])
    ];
    expect(Object.keys(result).sort()).toEqual([...expectedKeys].sort());
    if (task.task === 'ocr') {
      expect(result.productName).toBe(task.payload.产品名称);
      expect(result.ingredients).toEqual(task.payload.产品成分);
    } else {
      expect(task.task === 'skin' ? result.data : result).toMatchObject(task.payload);
    }
    if (result.analysisConfig) {
      expect(result.rawContent).toBe(JSON.stringify(task.payload));
      expect(result.analysisConfig).toMatchObject({
        model: config[task.modelKey], promptVersion: task.promptVersion,
        schemaVersion: task.schemaVersion, requestId, processingTime: expect.any(Number)
      });
    }
    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({
      event: 'ai_call', task: task.task, model: config[task.modelKey], status: 'succeeded',
      requestId, promptVersion: task.promptVersion, schemaVersion: task.schemaVersion
    }));
  });

  test.each(taskCases)('$task rejects incomplete output without retries or success-shaped fallback', async (task) => {
    const logger = { info: jest.fn(), error: jest.fn() };
    const httpClient = { post: jest.fn(async () => response({})) };
    const provider = createDashscopeProvider({ config, httpClient, logger });
    await expect(provider[task.method]({ ...task.input, requestId: `failed-${task.task}` }))
      .rejects.toMatchObject({ statusCode: 502, code: 'AI_OUTPUT_INVALID' });
    expect(httpClient.post).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({
      task: task.task, status: 'failed', errorCode: 'AI_OUTPUT_INVALID', requestId: `failed-${task.task}`
    }));
  });

  test('preserves the upstream timeout error and performs no automatic retry', async () => {
    const httpClient = { post: jest.fn().mockRejectedValue(Object.assign(new Error('timeout'), { code: 'ECONNABORTED' })) };
    const provider = createDashscopeProvider({ config, httpClient });
    await expect(provider.generatePlan({ products: [], user: {} }))
      .rejects.toMatchObject({ statusCode: 504, code: 'AI_UPSTREAM_ERROR' });
    expect(httpClient.post).toHaveBeenCalledTimes(1);
  });

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
      efficacyAnalysis: '保湿与修护：效果取决于配方。',
      potentialRisks: '观察耐受：敏感肌先局部试用。',
      recommendations: '使用时间：请遵循产品说明。',
      overallRating: 4.5,
      summary: '配方整体温和'
    })) };
    const provider = createDashscopeProvider({ config, httpClient });

    await expect(provider.analyzeIngredients({ productName: '测试精华', ingredients: ['角鲨烷'] }))
      .resolves.toMatchObject({
        activeIngredients: 4,
        acneRisk: { level: '低', percentage: 5 },
        irritationRisk: { level: '中', percentage: 15 },
        efficacyAnalysis: ['保湿与修护：效果取决于配方。'],
        potentialRisks: ['观察耐受：敏感肌先局部试用。'],
        recommendations: ['使用时间：请遵循产品说明。']
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
      efficacyAnalysis: ['保湿支持：可能帮助维持水分。'],
      potentialRisks: ['个体反应：敏感肌需留意耐受。'],
      recommendations: ['使用时间：请遵循产品说明。'],
      overallRating: 4,
      summary: '整体温和'
    }])) };
    const provider = createDashscopeProvider({ config, httpClient });

    await expect(provider.analyzeIngredients({ productName: '测试精华', ingredients: ['角鲨烷'] }))
      .resolves.toMatchObject({ safetyIndex: 90, activeIngredients: 3 });
  });

  test('rejects the former routines response instead of rendering it as advice', async () => {
    const httpClient = { post: jest.fn(async () => response({
      conflicts: [], safeCombo: [], recommendations: { routines: { morning: ['洁面'] } }
    })) };
    const provider = createDashscopeProvider({ config, httpClient });
    await expect(provider.analyzeConflict({ products: [] })).rejects.toMatchObject({ code: 'AI_OUTPUT_INVALID' });
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

  test('normalizes descriptive skin fields returned for the supplied real face image', async () => {
    const httpClient = { post: jest.fn(async () => response({
      skinType: {
        type: '混合性皮肤',
        subtype: 'T区偏油，两颊中性',
        basis: 'T区油脂分泌略高于面颊'
      },
      blackheads: { exists: true, severity: '轻度', distribution: ['鼻部'] },
      acne: {
        exists: true,
        count: 2,
        types: ['闭口粉刺'],
        activity: '稳定期（无明显红肿热痛）',
        distribution: ['下巴']
      },
      pores: { enlarged: true, severity: '轻度至中度', distribution: ['鼻翼'] },
      otherIssues: {},
      overallAssessment: {
        healthScore: 80,
        summary: '皮肤状态整体稳定',
        recommendations: ['温和清洁并注意保湿'],
        skinCondition: '良好'
      }
    })) };
    const provider = createDashscopeProvider({ config, httpClient });

    await expect(provider.analyzeSkin({ imageUrl: 'signed://supplied-real-face' }))
      .resolves.toMatchObject({
        data: {
          skinType: { subtype: '混油性' },
          blackheads: { severity: '少量' },
          acne: { count: '少量', activity: '不活跃' },
          pores: { severity: '中度' }
        }
      });
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
      efficacyAnalysis: ['保湿支持：可能帮助维持水分。'],
      potentialRisks: ['个体反应：敏感肌需留意耐受。'],
      recommendations: ['使用时间：请遵循产品说明。'],
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
  test('rejects ambiguous subtype instead of fabricating a classification and prompts the full enum', async () => {
    const httpClient = { post: jest.fn(async () => response({
      skinType: { type: '混合性皮肤', subtype: '轻度混合倾向', basis: '观察到轻微混合倾向' },
      blackheads: { exists: false, severity: '无', distribution: [] },
      acne: { exists: false, count: '无', types: [], activity: '不活跃', distribution: [] },
      pores: { enlarged: false, severity: '正常', distribution: [] },
      otherIssues: {},
      overallAssessment: { healthScore: 80, summary: '整体良好', recommendations: [], skinCondition: '良好' }
    })) };
    const provider = createDashscopeProvider({ config, httpClient });
    await expect(provider.analyzeSkin({ imageUrl: 'signed://fixture' })).rejects.toMatchObject({ code: 'AI_OUTPUT_INVALID' });
    const prompt = httpClient.post.mock.calls[0][1].messages[0].content.find((part) => part.type === 'text').text;
    expect(prompt).toContain('skinType.subtype：混油性/混干性/正常');
    expect(prompt).toContain('count：无/少量/中度/大量（不是数字）');
  });

  test('specifies numeric plan step ordinals and rejects descriptive step labels without inventing ordinals', async () => {
    const httpClient = { post: jest.fn(async () => response({
      name: '保湿修护',
      morning: [{ step: '保湿', product: '已有精华', reason: '日间保湿' }],
      evening: [{ step: '步骤1', product: '已有精华', reason: '夜间修护' }],
      recommendations: [], skinAnalysisSummary: '中性皮肤'
    })) };
    const provider = createDashscopeProvider({ config, httpClient });
    await expect(provider.generatePlan({ products: [{ name: '已有精华' }], user: { age: 28 },
      skinConcerns: ['hydration', 'repair'] })).rejects.toMatchObject({ code: 'AI_OUTPUT_INVALID' });
    const prompt = httpClient.post.mock.calls[0][1].messages[0].content;
    expect(prompt).toContain('"step": 1');
    expect(prompt).toContain('从 1 开始递增的 JSON 正整数');
    expect(prompt).toContain('skinAnalysisSummary 不能是对象');
    expect(httpClient.post).toHaveBeenCalledTimes(1);
  });

  test('splits observed OCR whole-label strings while keeping chemical commas and unknown name', async () => {
    const httpClient = { post: jest.fn(async () => response({
      产品名称: '', 产品成分: ['水、甘油，1,3-丙二醇、DMDM 乙内酰脲']
    })) };
    const provider = createDashscopeProvider({ config, httpClient });
    await expect(provider.extractProductInfo({ imageUrl: 'signed://label-without-name' })).resolves.toMatchObject({
      productName: '', ingredients: ['水', '甘油', '1,3-丙二醇', 'DMDM 乙内酰脲']
    });
    const prompt = httpClient.post.mock.calls[0][1].messages[0].content.find((part) => part.type === 'text').text;
    expect(prompt).toContain('没有可见的产品名称');
    expect(prompt).toContain('不能把整段成分塞进一个数组元素');
  });

  test('normalizes observed Color Index I/1 OCR confusion without changing C14-16 chemical prefixes', async () => {
    const httpClient = { post: jest.fn(async () => response({
      产品名称: '', 产品成分: ['C142090', 'Cl 42090', 'C14-16烯烃磺酸钠']
    })) };
    const provider = createDashscopeProvider({ config, httpClient });
    await expect(provider.extractProductInfo({ imageUrl: 'signed://color-index-label' })).resolves.toMatchObject({
      ingredients: ['CI42090', 'CI42090', 'C14-16烯烃磺酸钠']
    });
  });

  test('keeps exact OCR output and correlates HTTP, provider and persisted result provenance without logging content', async () => {
    const rawContent = '{ "产品名称": "审计产品", "产品成分": ["水、甘油"] }';
    const logger = { info: jest.fn(), error: jest.fn() };
    const upstream = response(rawContent);
    upstream.headers = { 'x-request-id': 'upstream-ocr-123' };
    Object.assign(upstream.data, { id: 'chatcmpl-123', model: 'vision-resolved-version',
      usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 } });
    const httpClient = { post: jest.fn(async () => upstream) };
    const provider = createDashscopeProvider({ config, httpClient, logger });
    const result = await provider.extractProductInfo({ imageUrl: 'signed://private-image', requestId: 'http-123' });
    expect(result.ingredients).toEqual(['水', '甘油']);
    expect(result.rawContent).toBe(rawContent);
    expect(result.analysisConfig).toMatchObject({
      provider: 'dashscope', model: config.ocrModel, upstreamModel: 'vision-resolved-version',
      promptVersion: 'ocr-v2-visible-label', schemaVersion: 'ocr-v1', requestId: 'http-123',
      upstreamRequestId: 'upstream-ocr-123', responseId: 'chatcmpl-123',
      analysisDate: expect.any(Date), processingTime: expect.any(Number), callId: expect.any(String),
      usage: { promptTokens: 100, completionTokens: 20, totalTokens: 120 }
    });
    expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({
      task: 'ocr', requestId: 'http-123', callId: result.analysisConfig.callId,
      upstreamRequestId: 'upstream-ocr-123', status: 'succeeded'
    }));
    const logs = JSON.stringify([logger.info.mock.calls, logger.error.mock.calls]);
    for (const secret of [rawContent, '审计产品', 'signed://private-image', config.apiKey]) expect(logs).not.toContain(secret);
  });

  test('retains ingredient arrays in raw evidence even when the compatibility field is normalized to a count', async () => {
    const original = {
      safetyIndex: 85, efficacyScore: 4, activeIngredients: ['甘油', '角鲨烷'],
      acneRisk: { level: '低', percentage: 5 }, irritationRisk: { level: '低', percentage: 5 },
      allergyRisk: { level: '低', percentage: 5 }, efficacyAnalysis: ['保湿支持：可能帮助维持水分。'], potentialRisks: ['个体反应：敏感肌需留意耐受。'],
      recommendations: ['观察耐受：不适时暂停使用。'], overallRating: 4, summary: '标签模型估计，非发生概率'
    };
    const httpClient = { post: jest.fn(async () => response(original)) };
    const provider = createDashscopeProvider({ config, httpClient });
    const result = await provider.analyzeIngredients({ productName: '测试产品', ingredients: ['甘油', '角鲨烷'], requestId: 'ingredient-http' });
    expect(result.activeIngredients).toBe(2);
    expect(JSON.parse(result.rawContent).activeIngredients).toEqual(['甘油', '角鲨烷']);
    expect(result.analysisConfig).toMatchObject({ model: config.textModel, requestId: 'ingredient-http',
      promptVersion: 'ingredients-v4-concise-reading', schemaVersion: 'ingredients-v2-concise-reading' });
    expect(result.analysisConfig.usage).toBeUndefined();
    const sentPrompt = httpClient.post.mock.calls[0][1].messages[0].content;
    expect(sentPrompt).toContain('产品：测试产品。成分：甘油、角鲨烷');
    expect(sentPrompt).toContain('产品类别无法确认');
    expect(sentPrompt).toContain('不得以“洗手液或沐浴露”等选项猜测类别');
    expect(sentPrompt).toContain('summary 应先写基于现有成分的主要分析结论');
  });

  test('applies the ingredient thinking budget only to the evaluated model and task, retaining complete output', async () => {
    const payload = taskCases.find((task) => task.task === 'ingredients').payload;
    const httpClient = { post: jest.fn(async () => response(payload)) };
    const provider = createDashscopeProvider({
      config: { ...config, ingredientThinkingBudget: 2048 }, httpClient
    });
    const result = await provider.analyzeIngredients({ productName: '测试产品', ingredients: ['水', '甘油'] });
    expect(httpClient.post.mock.calls[0][1]).toMatchObject({ enable_thinking: true, thinking_budget: 2048 });
    expect(httpClient.post.mock.calls[0][1]).not.toHaveProperty('max_tokens');
    expect(result).toMatchObject(payload);
    expect(result.analysisConfig).toMatchObject({ thinkingEnabled: true, thinkingBudget: 2048 });
    for (const task of taskCases.filter((item) => item.task !== 'ingredients')) {
      httpClient.post.mockResolvedValueOnce(response(task.payload));
      await provider[task.method](task.input);
      const body = httpClient.post.mock.calls.at(-1)[1];
      expect(body).not.toHaveProperty('enable_thinking');
      expect(body).not.toHaveProperty('thinking_budget');
    }
  });

  test.each(['qwen3.7-flash', 'unverified-text-model'])('can retain upstream thinking defaults for %s', async (textModel) => {
    const payload = taskCases.find((task) => task.task === 'ingredients').payload;
    const httpClient = { post: jest.fn(async () => response(payload)) };
    const provider = createDashscopeProvider({ config: { ...config, textModel,
      ingredientThinkingBudget: textModel === 'qwen3.7-flash' ? undefined : 2048 }, httpClient });
    const result = await provider.analyzeIngredients({ productName: '测试产品', ingredients: ['水'] });
    expect(httpClient.post.mock.calls[0][1]).not.toHaveProperty('thinking_budget');
    expect(result.analysisConfig).not.toHaveProperty('thinkingBudget');
  });

  test('records reasoning token counts without storing or logging the private reasoning text', async () => {
    const logger = { info: jest.fn(), error: jest.fn() };
    const payload = response({ 产品名称: '测试产品', 产品成分: ['水'] });
    payload.data.usage = { prompt_tokens: 100, completion_tokens: 1050, total_tokens: 1150,
      completion_tokens_details: { reasoning_tokens: 1024 } };
    payload.data.choices[0].message.reasoning_content = 'private-reasoning-never-record';
    const provider = createDashscopeProvider({ config,
      httpClient: { post: async () => payload }, logger });
    const result = await provider.extractProductInfo({ imageUrl: 'signed://private-image' });
    expect(result.analysisConfig.usage).toEqual({
      promptTokens: 100, completionTokens: 1050, totalTokens: 1150, reasoningTokens: 1024
    });
    expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({
      usage: expect.objectContaining({ reasoningTokens: 1024 })
    }));
    expect(JSON.stringify([result, logger.info.mock.calls])).not.toContain('private-reasoning-never-record');
  });

  test('keeps upstream identifiers on failed calls without exposing upstream error payloads', async () => {
    const logger = { info: jest.fn(), error: jest.fn() };
    const httpClient = { post: jest.fn(async () => {
      const error = new Error('private provider failure');
      error.response = { headers: { 'x-request-id': 'failed-upstream-123' }, data: { message: 'secret upstream payload' } };
      throw error;
    }) };
    const provider = createDashscopeProvider({ config, httpClient, logger });
    await expect(provider.extractProductInfo({ imageUrl: 'signed://private-image', requestId: 'failed-http-123' }))
      .rejects.toMatchObject({ code: 'AI_UPSTREAM_ERROR', statusCode: 502 });
    expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({
      status: 'failed', errorCode: 'AI_UPSTREAM_ERROR', requestId: 'failed-http-123',
      upstreamRequestId: 'failed-upstream-123', callId: expect.any(String)
    }));
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain('secret upstream payload');
  });

});
