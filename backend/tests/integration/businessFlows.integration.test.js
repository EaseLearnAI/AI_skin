const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const { createApp } = require('../../src/app');
const { createApiRouter } = require('../../src/routes');
const { createAuthService } = require('../../src/services/auth.service');
const { createDomainServices } = require('../../src/services');
const { createAccountDeletionService } = require('../../src/services/accountDeletion.service');
const Product = require('../../src/models/product.model');
const SkinAnalysis = require('../../src/models/skinAnalysis.model');

const validSkinAnalysis = {
  skinType: { type: '混合性皮肤', subtype: '混油性', basis: 'T 区油脂较明显' },
  blackheads: { exists: true, severity: '少量', distribution: ['鼻翼'] },
  acne: { exists: false, count: '无', types: [], activity: '不活跃', distribution: [] },
  pores: { enlarged: true, severity: '轻度', distribution: ['T区'] },
  otherIssues: {
    redness: { exists: false, severity: '轻度', distribution: [] },
    hyperpigmentation: { exists: false, types: [], distribution: [] },
    fineLines: { exists: false, severity: '轻度', distribution: [] },
    sensitivity: { exists: false, signs: [] },
    skinToneEvenness: { score: 8, description: '较均匀' }
  },
  overallAssessment: {
    healthScore: 82,
    summary: '整体状态良好',
    recommendations: ['温和清洁', '注意防晒'],
    skinCondition: '良好'
  }
};

describe('authenticated business flows', () => {
  let mongo;
  let app;
  let userA;
  let userB;
  let storageProvider;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());

    const aiProvider = {
      extractProductInfo: async () => ({ productName: '测试精华', ingredients: ['烟酰胺', '透明质酸'], rawContent: '{}' }),
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
      analyzeConflict: async () => ({
        conflicts: [],
        safeCombo: [{ components: ['烟酰胺', '透明质酸'], description: '可搭配' }],
        recommendations: {
          productPairings: { cannotUseTogether: [], canUseTogether: [] },
          routines: { morning: ['测试精华'], evening: ['测试乳霜'] }
        }
      }),
      generatePlan: async () => ({
        name: '轻量护肤方案',
        morning: [{ step: 1, product: '测试精华', reason: '保湿' }],
        evening: [{ step: 1, product: '测试乳霜', reason: '修护' }],
        recommendations: ['每日防晒'],
        skinAnalysisSummary: '混合性皮肤，注意温和护理'
      }),
      analyzeSkin: async () => ({
        data: validSkinAnalysis,
        rawContent: JSON.stringify(validSkinAnalysis),
        processingTime: 123,
        model: 'qwen3-vl-plus'
      })
    };
    storageProvider = {
      uploadProductImage: jest.fn(async () => ({ key: 'products/product.jpg', url: 'https://cdn.example/product.jpg' })),
      uploadFaceImage: jest.fn(async () => ({ key: 'faces/private-face.jpg', url: 'signed://private-face' })),
      deleteObject: jest.fn(async () => undefined),
      getPrivateUrl: jest.fn(async (key) => `signed://fresh/${key}`),
      getProductUrl: jest.fn(async (key) => `signed://fresh/${key}`),
      cleanupTempFile: jest.fn(async () => undefined)
    };
    const accountDeletionService = createAccountDeletionService({ storageProvider });
    const authService = createAuthService({
      jwtSecret: 'business-flow-secret-with-at-least-32-characters',
      jwtExpiresIn: '1h',
      passwordResetCodeGenerator: () => '123456',
      accountDeletionService
    });
    const services = createDomainServices({ aiProvider, storageProvider });
    app = createApp({ router: createApiRouter({ authService, ...services }) });
  }, 60000);

  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });

  beforeEach(async () => {
    await mongoose.connection.db.dropDatabase();
    jest.clearAllMocks();

    const createUser = async (phone, name) => {
      const response = await request(app).post('/api/users/register').send({
        name,
        phone,
        password: 'password123',
        gender: 'female'
      });
      return { id: response.body.data.user._id, token: response.body.token };
    };
    userA = await createUser('13900000101', '用户A');
    userB = await createUser('13900000102', '用户B');
  });

  const auth = (token) => ({ Authorization: `Bearer ${token}` });
  const createProduct = async (name, token = userA.token) => request(app)
    .post('/api/products')
    .set(auth(token))
    .send({ name, label: '精华' });

  test('runs the product upload, OCR and ingredient-analysis chain without cross-user access', async () => {
    const created = await createProduct('待识别产品');
    const productId = created.body.data.product._id;
    const image = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

    const uploaded = await request(app)
      .post(`/api/products/${productId}/upload-image`)
      .set(auth(userA.token))
      .attach('productImage', image, { filename: 'product.jpg', contentType: 'image/jpeg' });
    const extracted = await request(app)
      .post(`/api/products/${productId}/extract-ingredients`)
      .set(auth(userA.token))
      .send({});
    const analyzed = await request(app)
      .post(`/api/products/${productId}/analyze-ingredients`)
      .set(auth(userA.token))
      .send({});
    const analysis = await request(app)
      .get(`/api/products/${productId}/ingredient-analysis`)
      .set(auth(userA.token));
    const detail = await request(app)
      .get(`/api/products/${productId}`)
      .set(auth(userA.token));
    const forbidden = await request(app)
      .get(`/api/products/${productId}`)
      .set(auth(userB.token));
    const compatibilityList = await request(app)
      .get(`/api/products/user/${userA.id}`)
      .set(auth(userB.token));
    const ownCompatibilityList = await request(app)
      .get(`/api/products/user/${userA.id}`)
      .set(auth(userA.token));
    const labelList = await request(app)
      .get(`/api/products/user/${userA.id}/label/${encodeURIComponent('精华')}`)
      .set(auth(userA.token));

    expect(created.status).toBe(201);
    expect(uploaded.body.data.imageUrl).toBe('https://cdn.example/product.jpg');
    expect(extracted.body.data).toMatchObject({ name: '测试精华', ingredients: ['烟酰胺', '透明质酸'] });
    expect(analyzed.body.data.ingredientAnalysis.safetyIndex).toBe(92);
    expect(analysis.body.data.product.description).toBe('温和保湿精华');
    expect(detail.body.data.product.imageUrl).toBe('signed://fresh/products/product.jpg');
    expect(detail.body.data.product.storageKey).toBeUndefined();
    expect(forbidden.status).toBe(404);
    expect(compatibilityList.status).toBe(200);
    expect(compatibilityList.body.data.products).toEqual([]);
    expect(ownCompatibilityList.body.data.products).toHaveLength(1);
    expect(labelList.body.data.products).toHaveLength(1);
    expect(labelList.body.data.products[0].label).toBe('精华');
  });

  test('lists, updates and deletes a product through the existing routes', async () => {
    const created = await createProduct('旧名称');
    const id = created.body.data.product._id;
    const updated = await request(app).put(`/api/products/${id}`).set(auth(userA.token)).send({
      name: '新名称', description: '新描述', label: '乳霜'
    });
    const list = await request(app).get('/api/products?page=1&limit=10').set(auth(userA.token));
    const deleted = await request(app).delete(`/api/products/${id}`).set(auth(userA.token));
    const missing = await request(app).get(`/api/products/${id}`).set(auth(userA.token));

    expect(updated.body.data.product.name).toBe('新名称');
    expect(list.body.data.products).toHaveLength(1);
    expect(deleted.status).toBe(200);
    expect(missing.status).toBe(404);
  });

  test('analyzes product conflicts and scopes every summary/detail route to the current user', async () => {
    const first = await createProduct('测试精华');
    const second = await createProduct('测试乳霜');
    const ids = [first.body.data.product._id, second.body.data.product._id];

    // The chain requires ingredients, so run OCR for both products after assigning image URLs through upload.
    for (const id of ids) {
      const image = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
      await request(app).post(`/api/products/${id}/upload-image`).set(auth(userA.token))
        .attach('productImage', image, { filename: `${id}.jpg`, contentType: 'image/jpeg' });
      await request(app).post(`/api/products/${id}/extract-ingredients`).set(auth(userA.token)).send({});
    }
    const analyzed = await request(app).post('/api/conflicts').set(auth(userA.token)).send({ productIds: ids });
    const conflictId = analyzed.body.data.conflictId;
    const ownDetail = await request(app).get(`/api/conflicts/detail/${conflictId}`).set(auth(userA.token));
    const iosDetail = await request(app).get(`/api/conflicts/${conflictId}`).set(auth(userA.token));
    const foreignDetail = await request(app).get(`/api/conflicts/detail/${conflictId}`).set(auth(userB.token));
    const foreignSummary = await request(app).get(`/api/conflicts/user/${userA.id}`).set(auth(userB.token));
    const ownSummary = await request(app).get(`/api/conflicts/user/${userA.id}`).set(auth(userA.token));
    const list = await request(app).get('/api/conflicts').set(auth(userA.token));
    const deleted = await request(app).delete(`/api/conflicts/${conflictId}`).set(auth(userA.token));

    expect(analyzed.status).toBe(201);
    expect(analyzed.body.data.products[0].imageUrl).toBe('signed://fresh/products/product.jpg');
    expect(ownDetail.status).toBe(200);
    expect(iosDetail.status).toBe(200);
    expect(iosDetail.body.data.conflict._id).toBe(conflictId);
    expect(ownDetail.body.data.conflict.products[0].imageUrl).toBe('signed://fresh/products/product.jpg');
    expect(ownDetail.body.data.conflict.products[0].storageKey).toBeUndefined();
    expect(foreignDetail.status).toBe(404);
    expect(foreignSummary.body.data.conflicts).toEqual([]);
    expect(ownSummary.body.data.conflicts).toHaveLength(1);
    expect(list.body.data.conflicts).toHaveLength(1);
    expect(list.body.data.conflicts[0].products[0].imageUrl).toBe('signed://fresh/products/product.jpg');
    expect(deleted.status).toBe(200);
  });

  test('keeps feedback CRUD private to its creator', async () => {
    const created = await request(app).post('/api/ideas').set(auth(userA.token)).send({
      title: '增加提醒', content: '希望支持每日提醒', category: '功能建议'
    });
    const id = created.body.data.idea._id;
    const updated = await request(app).put(`/api/ideas/${id}`).set(auth(userA.token)).send({ title: '增加智能提醒' });
    const detail = await request(app).get(`/api/ideas/${id}`).set(auth(userA.token));
    const foreign = await request(app).get(`/api/ideas/${id}`).set(auth(userB.token));
    const list = await request(app).get('/api/ideas').set(auth(userA.token));
    const deleted = await request(app).delete(`/api/ideas/${id}`).set(auth(userA.token));

    expect(created.status).toBe(201);
    expect(updated.body.data.idea.title).toBe('增加智能提醒');
    expect(detail.status).toBe(200);
    expect(detail.body.data.idea._id).toBe(id);
    expect(foreign.status).toBe(404);
    expect(list.body.data.ideas).toHaveLength(1);
    expect(deleted.status).toBe(200);
  });

  test('runs private face upload, analysis, history, stats and object deletion', async () => {
    const image = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const analyzed = await request(app)
      .post('/api/skin-analysis/analyze')
      .set(auth(userA.token))
      .attach('faceImage', image, { filename: 'face.jpg', contentType: 'image/jpeg' });
    const id = analyzed.body.data.analysisId;
    const history = await request(app).get('/api/skin-analysis?page=1&limit=10').set(auth(userA.token));
    const latest = await request(app).get('/api/skin-analysis/latest').set(auth(userA.token));
    const stats = await request(app).get('/api/skin-analysis/stats').set(auth(userA.token));
    const foreign = await request(app).get(`/api/skin-analysis/${id}`).set(auth(userB.token));
    const detail = await request(app).get(`/api/skin-analysis/${id}`).set(auth(userA.token));
    const deleted = await request(app).delete(`/api/skin-analysis/${id}`).set(auth(userA.token));

    expect(analyzed.status).toBe(201);
    expect(analyzed.body.data.overallAssessment.healthScore).toBe(82);
    expect(history.body.data.analyses).toHaveLength(1);
    expect(latest.body.data.analysis._id).toBe(id);
    expect(latest.body.data.analysis.imageUrl).toBe('signed://fresh/faces/private-face.jpg');
    expect(stats.body.data.stats.averageHealthScore).toBe(82);
    expect(foreign.status).toBe(404);
    expect(detail.body.data.analysis._id).toBe(id);
    expect(deleted.status).toBe(200);
    expect(storageProvider.deleteObject).toHaveBeenCalledWith('faces/private-face.jpg');
  });

  test('generates, customizes, updates and deletes plans with the current iOS contract', async () => {
    await createProduct('测试精华');
    const generated = await request(app).post('/api/plans').set(auth(userA.token)).send({
      requirement: '保湿', userAge: 28, skinConcerns: ['干燥']
    });
    const planId = generated.body.data.plan._id;
    const updated = await request(app).patch(`/api/plans/${planId}/step`).set(auth(userA.token)).send({
      period: 'morning', step: 1, completed: true
    });
    const custom = await request(app).post('/api/plans/custom').set(auth(userA.token)).send({
      name: '自定义方案',
      morning: [{ step: 1, product: '清洁', reason: '基础清洁' }],
      evening: [],
      recommendations: ['坚持使用'],
      tags: ['自定义'],
      notes: '敏感时停用'
    });
    const foreign = await request(app).get(`/api/plans/${planId}`).set(auth(userB.token));
    const detail = await request(app).get(`/api/plans/${planId}`).set(auth(userA.token));
    const list = await request(app).get('/api/plans').set(auth(userA.token));
    const deleted = await request(app).delete(`/api/plans/${planId}`).set(auth(userA.token));

    expect(generated.status).toBe(201);
    expect(updated.body.data.plan.morning[0].completed).toBe(true);
    expect(custom.status).toBe(201);
    expect(custom.body.data.plan.origin).toBe('custom');
    expect(foreign.status).toBe(404);
    expect(detail.body.data.plan._id).toBe(planId);
    expect(list.body.data.plans).toHaveLength(2);
    expect(deleted.status).toBe(200);
  });

  test('deletes owned business data and private objects when the account is deleted', async () => {
    await createProduct('待删除产品');
    const image = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    await request(app).post('/api/skin-analysis/analyze').set(auth(userA.token))
      .attach('faceImage', image, { filename: 'face.jpg', contentType: 'image/jpeg' });

    const deleted = await request(app).delete('/api/users/delete-account').set(auth(userA.token));

    expect(deleted.status).toBe(200);
    expect(await Product.countDocuments({ createdBy: userA.id })).toBe(0);
    expect(await SkinAnalysis.countDocuments({ createdBy: userA.id })).toBe(0);
    expect(storageProvider.deleteObject).toHaveBeenCalledWith('faces/private-face.jpg');
  });

  test('rejects invalid feature requests without creating partial business data', async () => {
    const product = await createProduct('未完成产品');
    const productId = product.body.data.product._id;
    const invalidUpload = await request(app)
      .post(`/api/products/${productId}/upload-image`)
      .set(auth(userA.token))
      .attach('productImage', Buffer.from('not-an-image'), { filename: 'fake.jpg', contentType: 'image/jpeg' });
    const missingIngredients = await request(app)
      .post(`/api/products/${productId}/analyze-ingredients`)
      .set(auth(userA.token))
      .send({});
    const insufficientConflict = await request(app)
      .post('/api/conflicts')
      .set(auth(userA.token))
      .send({ productIds: [productId] });
    const noProductPlan = await request(app)
      .post('/api/plans')
      .set(auth(userB.token))
      .send({ requirement: '保湿' });
    const invalidFace = await request(app)
      .post('/api/skin-analysis/analyze')
      .set(auth(userA.token))
      .attach('faceImage', Buffer.from('not-a-face-image'), { filename: 'fake.jpg', contentType: 'image/jpeg' });
    const unauthenticated = await request(app).get('/api/products');

    expect(invalidUpload.status).toBe(400);
    expect(invalidUpload.body.code).toBe('INVALID_IMAGE');
    expect(missingIngredients.status).toBe(400);
    expect(missingIngredients.body.code).toBe('INGREDIENTS_REQUIRED');
    expect(insufficientConflict.status).toBe(400);
    expect(insufficientConflict.body.code).toBe('VALIDATION_ERROR');
    expect(noProductPlan.status).toBe(400);
    expect(noProductPlan.body.code).toBe('PRODUCTS_REQUIRED');
    expect(invalidFace.status).toBe(400);
    expect(invalidFace.body.code).toBe('INVALID_IMAGE');
    expect(unauthenticated.status).toBe(401);
  });
});
