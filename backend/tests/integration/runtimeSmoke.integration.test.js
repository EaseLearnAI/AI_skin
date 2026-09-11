const { conflictReport } = require('../fixtures/conflictReport');
const { MongoMemoryServer } = require('mongodb-memory-server');
const fs = require('fs/promises');

const { createRuntime } = require('../../src');

describe('real local HTTP runtime smoke', () => {
  test('starts on loopback, becomes ready and serves phone auth over HTTP', async () => {
    const mongo = await MongoMemoryServer.create();
    const runtime = createRuntime({
      env: {
        NODE_ENV: 'test',
        PORT: '0',
        MONGODB_URI: mongo.getUri(),
        JWT_SECRET: 'runtime-smoke-secret-with-at-least-32-characters'
      },
      overrides: {
        logger: { info: jest.fn(), error: jest.fn() },
        appleVerifier: { verify: async () => ({ sub: 'unused' }) },
        appleOAuthClient: { exchangeCode: async () => ({ refreshToken: 'unused' }), revokeRefreshToken: async () => undefined },
        storageProvider: {
          uploadProductImage: async () => { throw new Error('not used'); },
          uploadFaceImage: async () => { throw new Error('not used'); },
          deleteObject: async () => undefined,
          cleanupTempFile: async () => undefined
        },
        aiProvider: {},
        passwordResetSender: { sendCode: async () => undefined }
      }
    });

    try {
      await runtime.start();
      const address = runtime.server.address();
      expect(address.address).toBe('127.0.0.1');
      const base = `http://127.0.0.1:${address.port}`;

      const health = await fetch(`${base}/health`).then((response) => response.json());
      const ready = await fetch(`${base}/ready`).then(async (response) => ({ status: response.status, body: await response.json() }));
      const registration = await fetch(`${base}/api/users/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Smoke User',
          phone: '13900000888',
          password: 'password123',
          gender: 'female'
        })
      }).then(async (response) => ({ status: response.status, body: await response.json() }));

      expect(health).toEqual({ success: true, status: 'ok' });
      expect(ready).toEqual({ status: 200, body: { success: true, status: 'ready' } });
      expect(registration.status).toBe(201);
      expect(registration.body.token).toEqual(expect.any(String));
    } finally {
      await runtime.stop();
      await mongo.stop();
    }
  });

  test('serves the critical iOS feature chains through a real loopback listener', async () => {
    const mongo = await MongoMemoryServer.create();
    let productUploadIndex = 0;
    const skinResult = {
      skinType: { type: '混合性皮肤', subtype: '混油性', basis: 'T 区油脂较明显' },
      blackheads: { exists: true, severity: '少量', distribution: ['鼻翼'] },
      acne: { exists: false, count: '无', types: [], activity: '不活跃', distribution: [] },
      pores: { enlarged: true, severity: '轻度', distribution: ['T区'] },
      otherIssues: { skinToneEvenness: { score: 8, description: '较均匀' } },
      overallAssessment: {
        healthScore: 82,
        summary: '整体状态良好',
        recommendations: ['温和清洁', '注意防晒'],
        skinCondition: '良好'
      }
    };
    const runtime = createRuntime({
      env: {
        NODE_ENV: 'test',
        PORT: '0',
        MONGODB_URI: mongo.getUri(),
        JWT_SECRET: 'full-feature-runtime-secret-at-least-32-characters'
      },
      overrides: {
        logger: { info: jest.fn(), error: jest.fn() },
        appleVerifier: { verify: async () => ({ sub: 'unused' }) },
        appleOAuthClient: {
          exchangeCode: async () => ({ refreshToken: 'unused' }),
          revokeRefreshToken: async () => undefined
        },
        storageProvider: {
          uploadProductImage: async () => {
            productUploadIndex += 1;
            return {
              key: `products/runtime-${productUploadIndex}.jpg`,
              url: `signed://products/runtime-${productUploadIndex}.jpg`
            };
          },
          uploadFaceImage: async () => ({ key: 'faces/runtime.jpg', url: 'signed://faces/runtime.jpg' }),
          deleteObject: async () => undefined,
          getPrivateUrl: async (key) => `signed://fresh/${key}`,
          getProductUrl: async (key) => `signed://fresh/${key}`,
          cleanupTempFile: async (filePath) => fs.unlink(filePath).catch((error) => {
            if (error.code !== 'ENOENT') throw error;
          })
        },
        aiProvider: {
          extractProductInfo: async () => ({
            productName: '运行时测试产品', ingredients: ['烟酰胺', '透明质酸'], rawContent: '{}'
          }),
          analyzeIngredients: async () => ({
            safetyIndex: 92,
            efficacyScore: 4.5,
            activeIngredients: 2,
            acneRisk: { level: '低', percentage: 5 },
            irritationRisk: { level: '低', percentage: 5 },
            allergyRisk: { level: '低', percentage: 5 },
            efficacyAnalysis: ['保湿'],
            potentialRisks: [],
            recommendations: ['晚间使用'],
            overallRating: 4.6,
            summary: '温和保湿精华'
          }),
          analyzeConflict: async ({ products }) => conflictReport(products),
          generatePlan: async () => ({
            name: '运行时护肤方案',
            morning: [{ step: 1, product: '产品一', reason: '保湿' }],
            evening: [{ step: 1, product: '产品二', reason: '修护' }],
            recommendations: ['每日防晒'],
            skinAnalysisSummary: '混合性皮肤'
          }),
          analyzeSkin: async () => ({
            data: skinResult,
            rawContent: JSON.stringify(skinResult),
            processingTime: 100,
            model: 'qwen3-vl-plus'
          })
        },
        passwordResetSender: { sendCode: async () => undefined }
      }
    });

    const call = async (base, path, { method = 'GET', token, body, form } = {}) => {
      const headers = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      const response = await fetch(`${base}${path}`, {
        method,
        headers,
        body: form || (body === undefined ? undefined : JSON.stringify(body))
      });
      return { status: response.status, body: await response.json() };
    };
    const imageForm = (fieldName, filename) => {
      const form = new FormData();
      form.append(
        fieldName,
        new Blob([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])], { type: 'image/jpeg' }),
        filename
      );
      return form;
    };

    try {
      await runtime.start();
      const address = runtime.server.address();
      const base = `http://127.0.0.1:${address.port}`;

      const registration = await call(base, '/api/users/register', {
        method: 'POST',
        body: { name: '全链路用户', phone: '13900000889', password: 'password123', gender: 'female' }
      });
      const login = await call(base, '/api/users/login', {
        method: 'POST', body: { phone: '13900000889', password: 'password123' }
      });
      const token = login.body.token;
      const me = await call(base, '/api/users/me', { token });

      const products = [];
      for (const name of ['产品一', '产品二']) {
        const created = await call(base, '/api/products', {
          method: 'POST', token, body: { name, label: '精华' }
        });
        const id = created.body.data.product._id;
        const uploaded = await call(base, `/api/products/${id}/upload-image`, {
          method: 'POST', token, form: imageForm('productImage', `${name}.jpg`)
        });
        const extracted = await call(base, `/api/products/${id}/extract-ingredients`, {
          method: 'POST', token, body: {}
        });
        expect(created.status).toBe(201);
        expect(uploaded.status).toBe(200);
        expect(extracted.status).toBe(200);
        products.push(id);
      }

      const ingredientAnalysis = await call(base, `/api/products/${products[0]}/analyze-ingredients`, {
        method: 'POST', token, body: {}
      });
      const ingredientDetail = await call(base, `/api/products/${products[0]}/ingredient-analysis`, { token });
      const conflict = await call(base, '/api/conflicts', {
        method: 'POST', token, body: { productIds: products }
      });
      const conflictDetail = await call(base, `/api/conflicts/${conflict.body.data.conflictId}`, { token });
      const plan = await call(base, '/api/plans', {
        method: 'POST', token, body: { requirement: '保湿', userAge: 28, skinConcerns: ['干燥'] }
      });
      const planList = await call(base, '/api/plans', { token });
      const skin = await call(base, '/api/skin-analysis/analyze', {
        method: 'POST', token, form: imageForm('faceImage', 'face.jpg')
      });
      const skinHistory = await call(base, '/api/skin-analysis?page=1&limit=10', { token });
      const skinLatest = await call(base, '/api/skin-analysis/latest', { token });
      const skinStats = await call(base, '/api/skin-analysis/stats', { token });

      expect(address.address).toBe('127.0.0.1');
      expect(registration.status).toBe(201);
      expect(login.status).toBe(200);
      expect(me.status).toBe(200);
      expect(ingredientAnalysis.body.data.ingredientAnalysis.safetyIndex).toBe(92);
      expect(ingredientDetail.status).toBe(200);
      expect(conflict.status).toBe(201);
      expect(conflictDetail.status).toBe(200);
      expect(plan.status).toBe(201);
      expect(planList.body.data.plans).toHaveLength(1);
      expect(skin.status).toBe(201);
      expect(skin.body.data.overallAssessment.healthScore).toBe(82);
      expect(skinHistory.body.data.analyses).toHaveLength(1);
      expect(skinLatest.body.data.analysis._id).toBe(skin.body.data.analysisId);
      expect(skinStats.body.data.stats.totalAnalyses).toBe(1);
    } finally {
      await runtime.stop();
      await mongo.stop();
    }
  });
});
