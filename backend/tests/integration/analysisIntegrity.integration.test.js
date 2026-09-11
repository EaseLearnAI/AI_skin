const fs = require('fs/promises');
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { createApp } = require('../../src/app');
const { createApiRouter } = require('../../src/routes');
const { createDomainServices } = require('../../src/services');
const Product = require('../../src/models/product.model');
const SkinAnalysis = require('../../src/models/skinAnalysis.model');
const { ApiError } = require('../../src/middlewares/error');

// Real HTTP and MongoDB exercise persistence and concurrency; AI/OSS are fault-injection doubles.
describe('analysis integrity with real MongoDB and stubbed external providers', () => {
  let mongo; let app; let userId; let services; let ai; let storage; let imageCounter; let logger;
  const ingredientAnalysis = { safetyIndex: 84, efficacyScore: 4, activeIngredients: 1,
    acneRisk: { level: '低', percentage: 3 }, irritationRisk: { level: '低', percentage: 3 },
    allergyRisk: { level: '低', percentage: 3 }, efficacyAnalysis: ['保湿'], potentialRisks: [],
    recommendations: ['局部试用'], overallRating: 4, summary: '基于成分表的保湿分析' };
  const metadata = { provider: 'dashscope', model: 'test-model', promptVersion: 'test-v1',
    schemaVersion: 'test-v1', analysisDate: new Date(), processingTime: 10 };
  const skinData = { skinType: { type: '中性皮肤', subtype: '正常', basis: '照片观察' },
    blackheads: { exists: false, severity: '无', distribution: [] },
    acne: { exists: false, count: '无', types: [], activity: '不活跃', distribution: [] },
    pores: { enlarged: false, severity: '正常', distribution: [] }, otherIssues: {},
    overallAssessment: { healthScore: 80, summary: '照片可见状态', recommendations: [], skinCondition: '良好' } };
  const call = (method, path, body) => request(app)[method](`/api${path}`)
    .set('Authorization', `Bearer ${userId}`).send(body);
  const upload = (id) => request(app).post(`/api/products/${id}/upload-image`)
    .set('Authorization', `Bearer ${userId}`)
    .attach('productImage', Buffer.from([0xff, 0xd8, 0xff, 0xe0]), { filename: 'test.jpg', contentType: 'image/jpeg' });
  const product = (extra = {}) => Product.create({ createdBy: userId, name: '原产品',
    imageUrl: 'https://storage.test/old', storageKey: 'products/old.jpg', ingredients: ['甘油'],
    ingredientAnalysis, description: ingredientAnalysis.summary, ...extra });

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
  });
  afterAll(async () => { await mongoose.disconnect(); if (mongo) await mongo.stop(); });
  afterEach(() => jest.restoreAllMocks());
  beforeEach(async () => {
    await Promise.all([Product.deleteMany({}), SkinAnalysis.deleteMany({})]);
    userId = new mongoose.Types.ObjectId(); imageCounter = 0;
    ai = {
      extractProductInfo: jest.fn(async () => ({ productName: '识别产品', ingredients: ['甘油', '水'],
        rawContent: '{"产品名称":"识别产品","产品成分":["甘油","水"]}', analysisConfig: metadata })),
      analyzeIngredients: jest.fn(async () => ({ ...ingredientAnalysis, analysisConfig: metadata,
        rawContent: JSON.stringify(ingredientAnalysis) })),
      analyzeSkin: jest.fn(async () => ({ data: skinData, rawContent: JSON.stringify(skinData),
        model: 'test-model', analysisConfig: metadata }))
    };
    storage = {
      uploadProductImage: jest.fn(async () => ({ key: `products/new-${++imageCounter}.jpg`, url: `https://storage.test/new-${imageCounter}` })),
      uploadFaceImage: jest.fn(async () => ({ key: 'faces/current.jpg', url: 'https://storage.test/face' })),
      getProductUrl: async (key) => `https://storage.test/${key}`,
      getPrivateUrl: async (key) => `https://storage.test/${key}`,
      deleteObject: jest.fn(async () => undefined),
      cleanupTempFile: jest.fn(async (path) => fs.unlink(path))
    };
    logger = { error: jest.fn() };
    services = createDomainServices({ aiProvider: ai, storageProvider: storage, logger });
    const authService = { authenticateAccessToken: async () => ({ _id: userId }) };
    app = createApp({ router: createApiRouter({ authService, ...services }) });
  });

  test('rejects empty OCR without clearing the previous ingredients or report', async () => {
    const saved = await product();
    ai.extractProductInfo.mockResolvedValueOnce({ productName: '', ingredients: [], rawContent: '{}' });
    const result = await call('post', `/products/${saved._id}/extract-ingredients`, {});
    expect(result.status).toBe(422);
    expect(result.body.code).toBe('OCR_INGREDIENTS_NOT_FOUND');
    const unchanged = await Product.findById(saved._id);
    expect(unchanged.ingredients).toEqual(['甘油']);
    expect(unchanged.ingredientAnalysis.summary).toBe(ingredientAnalysis.summary);
  });

  test.each(['extractIngredients', 'analyzeIngredients'])('rejects stale %s results after the product changes while AI is running', async (method) => {
    const saved = await product();
    const aiMethod = method === 'extractIngredients' ? 'extractProductInfo' : 'analyzeIngredients';
    const output = await ai[aiMethod]();
    ai[aiMethod].mockImplementationOnce(async () => {
      await Product.updateOne({ _id: saved._id }, { $set: { name: '新图片产品', ingredients: ['烟酰胺'],
        imageUrl: 'https://storage.test/replaced', ingredientAnalysis: null }, $inc: { __v: 1 } });
      return output;
    });
    await expect(services.productService[method](userId, saved._id)).rejects.toMatchObject({ code: 'PRODUCT_CHANGED', statusCode: 409 });
    const current = await Product.findById(saved._id);
    expect(current.name).toBe('新图片产品');
    expect(current.ingredients).toEqual(['烟酰胺']);
    expect(current.ingredientAnalysis).toBeNull();
  });

  test('a database failure during image replacement retains the old image and removes the new object', async () => {
    const saved = await product();
    jest.spyOn(Product, 'findOneAndUpdate').mockRejectedValueOnce(new Error('database write failed'));
    const result = await upload(saved._id);
    expect(result.status).toBe(500);
    expect(storage.deleteObject).toHaveBeenCalledWith('products/new-1.jpg');
    expect(storage.deleteObject).not.toHaveBeenCalledWith('products/old.jpg');
    expect((await Product.findById(saved._id).select('+storageKey')).storageKey).toBe('products/old.jpg');
    expect(storage.cleanupTempFile).toHaveBeenCalledTimes(1);
  });

  test('a rejected upload still removes its temporary file', async () => {
    const result = await upload(new mongoose.Types.ObjectId());
    expect(result.status).toBe(404);
    expect(storage.uploadProductImage).not.toHaveBeenCalled();
    expect(storage.cleanupTempFile).toHaveBeenCalledTimes(1);
  });

  test('retains failed old-image cleanup for retry while the committed new image remains usable', async () => {
    const saved = await product();
    storage.deleteObject.mockRejectedValueOnce(new Error('temporary OSS failure'));
    const result = await upload(saved._id);
    expect(result.status).toBe(200);
    const committed = await Product.findById(saved._id).select('+storageKey +pendingStorageKeys');
    expect(committed.storageKey).toBe('products/new-1.jpg');
    expect(committed.pendingStorageKeys).toEqual(['products/old.jpg']);
    const publicProduct = (await call('get', `/products/${saved._id}`)).body.data.product;
    expect(publicProduct.storageKey).toBeUndefined();
    expect(publicProduct.pendingStorageKeys).toBeUndefined();
    expect((await upload(saved._id)).status).toBe(200);
    expect((await Product.findById(saved._id).select('+pendingStorageKeys')).pendingStorageKeys).toEqual([]);
    expect(storage.deleteObject).toHaveBeenCalledWith('products/new-1.jpg');
  });

  test('preserves a product if OSS deletion fails so deletion can be retried', async () => {
    const saved = await product();
    storage.deleteObject.mockRejectedValueOnce(new Error('temporary OSS failure'));
    expect((await call('delete', `/products/${saved._id}`)).status).toBe(500);
    expect(await Product.exists({ _id: saved._id })).not.toBeNull();
    expect((await call('delete', `/products/${saved._id}`)).status).toBe(200);
    expect(await Product.exists({ _id: saved._id })).toBeNull();
  });

  test('stores OCR and ingredient provenance separately and does not expose raw output on product reads', async () => {
    const saved = await product();
    const extracted = await call('post', `/products/${saved._id}/extract-ingredients`, {});
    const analyzed = await call('post', `/products/${saved._id}/analyze-ingredients`, {});
    expect(extracted.status).toBe(200); expect(analyzed.status).toBe(200);
    expect(ai.extractProductInfo).toHaveBeenCalledWith(expect.objectContaining({ requestId: expect.any(String) }));
    expect(ai.analyzeIngredients).toHaveBeenCalledWith(expect.objectContaining({ requestId: expect.any(String) }));
    const stored = await Product.findById(saved._id).select('+rawOcrResult +rawIngredientAnalysisResult');
    expect(stored.ocrConfig.model).toBe('test-model');
    expect(stored.ingredientAnalysisConfig.model).toBe('test-model');
    expect(JSON.parse(stored.rawIngredientAnalysisResult)).toEqual(ingredientAnalysis);
    expect(stored.rawOcrResult).toContain('识别产品');
    const result = (await call('get', `/products/${saved._id}`)).body.data.product;
    expect(result.rawOcrResult).toBeUndefined();
    expect(result.rawIngredientAnalysisResult).toBeUndefined();
    expect(result.ingredientAnalysis).toEqual(ingredientAnalysis);
  });

  test('distinguishes missing scores from a model-provided zero', async () => {
    const skinStats = await call('get', '/skin-analysis/stats');
    expect(skinStats.body.data.stats.averageHealthScore).toBeNull();
    const saved = await product({ ingredientAnalysis: null });
    let list = await call('get', `/products/user/${userId}`);
    expect(list.body.data.products[0]).toMatchObject({ safetyScore: null, efficacyScore: null, overallRating: null });
    await Product.updateOne({ _id: saved._id }, { ingredientAnalysis: { safetyIndex: 0, efficacyScore: 0, overallRating: 0 } });
    list = await call('get', `/products/user/${userId}`);
    expect(list.body.data.products[0]).toMatchObject({ safetyScore: 0, efficacyScore: 0, overallRating: 0 });
  });

  test('returns optional skin fields consistently on initial result and detail, without inventing missing metrics', async () => {
    ai.analyzeSkin.mockResolvedValueOnce({ data: { ...skinData, moisture: 42, glossiness: 13 },
      rawContent: JSON.stringify(skinData), model: 'test-model', analysisConfig: metadata });
    const analyzed = await request(app).post('/api/skin-analysis/analyze').set('Authorization', `Bearer ${userId}`)
      .attach('faceImage', Buffer.from([0xff, 0xd8, 0xff, 0xe0]), { filename: 'face.jpg', contentType: 'image/jpeg' });
    expect(analyzed.status).toBe(201);
    const detail = (await call('get', `/skin-analysis/${analyzed.body.data.analysisId}`)).body.data.analysis;
    expect(analyzed.body.data).toMatchObject({ moisture: 42, glossiness: 13, createdAt: detail.createdAt, context: detail.context });
    expect(analyzed.body.data.elasticity).toBeUndefined();
    expect(detail.elasticity).toBeUndefined();
    expect(analyzed.body.data.rawAnalysisResult).toBeUndefined();
    expect(analyzed.body.data.storageKey).toBeUndefined();
    expect(ai.analyzeSkin).toHaveBeenCalledWith(expect.objectContaining({ requestId: expect.any(String) }));
  });

  const failTempCleanup = () => storage.cleanupTempFile.mockImplementationOnce(async (path) => {
    await fs.unlink(path);
    throw new Error('private temporary-file detail');
  });
  const uploadFace = (data = Buffer.from([0xff, 0xd8, 0xff, 0xe0]), contentType = 'image/jpeg') =>
    request(app).post('/api/skin-analysis/analyze').set('Authorization', `Bearer ${userId}`)
      .attach('faceImage', data, { filename: contentType === 'image/gif' ? 'face.gif' : 'face.jpg', contentType });

  test('retains the AI error when face object rollback and temporary cleanup both fail', async () => {
    ai.analyzeSkin.mockRejectedValueOnce(new ApiError(504, 'AI 服务暂时不可用', 'AI_UPSTREAM_ERROR'));
    storage.deleteObject.mockRejectedValueOnce(new Error('private OSS detail'));
    failTempCleanup();
    const result = await uploadFace();
    expect(result.status).toBe(504);
    expect(result.body.code).toBe('AI_UPSTREAM_ERROR');
    expect(await SkinAnalysis.countDocuments()).toBe(0);
    expect(storage.deleteObject).toHaveBeenCalledWith('faces/current.jpg');
    expect(logger.error).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(logger.error.mock.calls)).not.toMatch(/private OSS detail|private temporary-file detail/);
  });

  test('retains the database error when product rollback and temporary cleanup both fail', async () => {
    const saved = await product();
    jest.spyOn(Product, 'findOneAndUpdate').mockRejectedValueOnce(new ApiError(503, '暂时无法保存', 'WRITE_UNAVAILABLE'));
    storage.deleteObject.mockRejectedValueOnce(new Error('private OSS detail'));
    failTempCleanup();
    const result = await upload(saved._id);
    expect(result.status).toBe(503);
    expect(result.body.code).toBe('WRITE_UNAVAILABLE');
    expect((await Product.findById(saved._id).select('+storageKey')).storageKey).toBe('products/old.jpg');
    expect(storage.deleteObject).not.toHaveBeenCalledWith('products/old.jpg');
    expect(logger.error).toHaveBeenCalledTimes(2);
  });

  test.each(['face', 'product'])('keeps a committed %s result successful when temporary cleanup fails', async (kind) => {
    const saved = kind === 'product' ? await product({ storageKey: null }) : null;
    failTempCleanup();
    const result = kind === 'face' ? await uploadFace() : await upload(saved._id);
    expect(result.status).toBe(kind === 'face' ? 201 : 200);
    expect(storage.deleteObject).not.toHaveBeenCalled();
    if (kind === 'face') expect(await SkinAnalysis.countDocuments()).toBe(1);
    else expect((await Product.findById(saved._id).select('+storageKey')).storageKey).toBe('products/new-1.jpg');
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  test('keeps the existing product GIF support and face JPEG/PNG boundary', async () => {
    const gif = Buffer.from('GIF89a');
    const rejected = await uploadFace(gif, 'image/gif');
    expect(rejected.status).toBe(400);
    expect(rejected.body.code).toBe('INVALID_IMAGE');
    expect(storage.uploadFaceImage).not.toHaveBeenCalled();
    const saved = await product({ storageKey: null });
    const accepted = await request(app).post(`/api/products/${saved._id}/upload-image`)
      .set('Authorization', `Bearer ${userId}`)
      .attach('productImage', gif, { filename: 'label.gif', contentType: 'image/gif' });
    expect(accepted.status).toBe(200);
    expect(storage.cleanupTempFile).toHaveBeenCalledTimes(2);
  });

  test('a stale image upload removes only its own object and preserves the concurrent winner', async () => {
    const saved = await product();
    storage.uploadProductImage.mockImplementationOnce(async () => {
      await Product.updateOne({ _id: saved._id }, {
        $set: { storageKey: 'products/winner.jpg', imageUrl: 'https://storage.test/winner' },
        $inc: { __v: 1 }
      });
      return { key: 'products/loser.jpg', url: 'https://storage.test/loser' };
    });
    const result = await upload(saved._id);
    expect(result.status).toBe(409);
    expect(result.body.code).toBe('PRODUCT_CHANGED');
    expect(storage.deleteObject.mock.calls).toEqual([['products/loser.jpg']]);
    expect((await Product.findById(saved._id).select('+storageKey')).storageKey).toBe('products/winner.jpg');
  });

  test.each([
    ['face', 'FACE_IMAGE_REQUIRED'], ['product', 'IMAGE_REQUIRED']
  ])('preserves the missing-file error for %s', async (kind, code) => {
    const saved = kind === 'product' ? await product() : null;
    const path = kind === 'face' ? '/skin-analysis/analyze' : `/products/${saved._id}/upload-image`;
    const result = await call('post', path, {});
    expect(result.status).toBe(400);
    expect(result.body.code).toBe(code);
    expect(storage.cleanupTempFile).not.toHaveBeenCalled();
  });

  test.each(['face', 'product'])('accepts the existing PNG signature for %s', async (kind) => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const saved = kind === 'product' ? await product({ storageKey: null }) : null;
    const result = kind === 'face' ? await uploadFace(png, 'image/png')
      : await request(app).post(`/api/products/${saved._id}/upload-image`)
        .set('Authorization', `Bearer ${userId}`)
        .attach('productImage', png, { filename: 'label.png', contentType: 'image/png' });
    expect(result.status).toBe(kind === 'face' ? 201 : 200);
  });
});
