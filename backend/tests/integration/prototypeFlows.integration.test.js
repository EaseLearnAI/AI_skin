const { conflictReport } = require('../fixtures/conflictReport');
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { createApp } = require('../../src/app');
const { createApiRouter } = require('../../src/routes');
const { createDomainServices } = require('../../src/services');
const { createAccountDeletionService } = require('../../src/services/accountDeletion.service');
const User = require('../../src/models/user.model');
const Plan = require('../../src/models/plan.model');
const Product = require('../../src/models/product.model');
const SkinAnalysis = require('../../src/models/skinAnalysis.model');
const Conflict = require('../../src/models/conflict.model');
const DailyRoutine = require('../../src/models/dailyRoutine.model');

describe('prototype contracts with real MongoDB and HTTP, stubbed external providers', () => {
  let mongo; let app; let owner; let foreign; let ai; let storage; let services;
  const planInput = { name: '基础护理', morning: [{ step: 1, product: '洁面' }, { step: 2, product: '保湿' }], evening: [{ step: 1, product: '修护' }] };
  const day = { date: '2026-09-09', timezone: 'Asia/Shanghai' };
  const pendingRequests = new Map();
  const send = async (method, path, body, user = owner) => {
    const diagnostic = { method: method.toUpperCase(), path: `/api${path}`, startedAt: Date.now(), stage: 'waiting for response' };
    pendingRequests.set(diagnostic, diagnostic);
    const pending = request(app)[method](diagnostic.path).set('Authorization', `Bearer ${user._id}`)
      .send(body).timeout({ response: 5000, deadline: 10000 });
    pending.on('response', () => { diagnostic.stage = 'response received; waiting for test request completion'; });
    try {
      return await pending;
    } catch (error) {
      error.message = `${diagnostic.method} ${diagnostic.path} (${diagnostic.stage}, ${Date.now() - diagnostic.startedAt} ms): ${error.message}`;
      throw error;
    } finally {
      pendingRequests.delete(diagnostic);
    }
  };
  const createPlan = async () => (await send('post', '/plans/custom', planInput)).body.data.plan;
  const daily = (planId, extra = {}, user = owner) => send('put', `/plans/${planId}/daily/steps`, { ...day, period: 'morning', step: 1, completed: true, ...extra }, user);
  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    await DailyRoutine.init();
  });
  afterAll(async () => { await mongoose.disconnect(); if (mongo) await mongo.stop(); });
  afterEach(() => {
    // If Jest's outer deadline fires after a response, preserve the request/close
    // stage instead of reporting only the test declaration's line number.
    if (pendingRequests.size) console.error('Unfinished local test requests', [...pendingRequests.values()].map(
      ({ method, path, stage, startedAt }) => ({ method, path, stage, elapsedMs: Date.now() - startedAt })
    ));
  });
  beforeEach(async () => {
    for (const model of [User, Plan, Product, SkinAnalysis, Conflict, DailyRoutine]) await model.deleteMany({});
    owner = await User.create({ name: '甲', appleSubject: 'owner' });
    foreign = await User.create({ name: '乙', appleSubject: 'foreign' });
    ai = { generatePlan: jest.fn(async () => planInput), analyzeConflict: jest.fn(async ({ products }) => conflictReport(products)) };
    storage = { getProductUrl: async () => 'signed://live-image', getPrivateUrl: async () => 'signed://private', deleteObject: jest.fn() };
    services = createDomainServices({ aiProvider: ai, storageProvider: storage });
    const authService = { authenticateAccessToken: async (id) => User.findById(id) };
    app = createApp({ router: createApiRouter({ authService, ...services }) });
  });

  test('generation and custom creation never implicitly activate, with explicit selection and null persistence', async () => {
    await Product.create({ name: '精华', createdBy: owner._id });
    const generated = await send('post', '/plans', { requirement: '保湿' });
    expect(generated.status).toBe(201);
    expect((await send('get', '/plans/active')).body.data.plan).toBeNull();
    const second = await createPlan();
    expect((await send('get', '/plans/active')).body.data.plan).toBeNull();
    expect((await send('put', '/plans/active', { planId: second._id })).body.data.plan._id).toBe(second._id);
    expect((await send('put', '/plans/active', { planId: second._id }, foreign)).status).toBe(404);
    await send('put', '/plans/active', { planId: null });
    await createPlan();
    expect((await send('get', '/plans/active')).body.data.plan).toBeNull();
  });

  test('legacy selection initializes once, and deleting an active plan clears the pointer', async () => {
    const legacy = await Plan.create({ ...planInput, createdBy: owner._id });
    const created = await createPlan();
    expect((await send('get', '/plans/active')).body.data.plan._id).toBe(String(legacy._id));
    await send('put', '/plans/active', { planId: created._id });
    await daily(created._id);
    await send('delete', `/plans/${created._id}`);
    expect((await send('get', '/plans/active')).body.data.plan).toBeNull();
    expect(await DailyRoutine.countDocuments({ planId: created._id })).toBe(0);
  });

  test('daily records isolate dates, preserve history across switching, and ignore legacy permanent completion', async () => {
    const plan = await createPlan();
    await send('patch', `/plans/${plan._id}/step`, { period: 'morning', step: 1, completed: true });
    const empty = await send('get', `/plans/${plan._id}/daily?date=${day.date}&timezone=Asia%2FShanghai`);
    expect(empty.status).toBe(200);
    expect(empty.body.data.daily.completedCount).toBe(0);
    await daily(plan._id);
    const repeated = await daily(plan._id);
    expect(repeated.body.data.daily.completedCount).toBe(1);
    expect(await DailyRoutine.countDocuments({ planId: plan._id })).toBe(1);
    await send('put', '/plans/active', { planId: null });
    await send('put', '/plans/active', { planId: plan._id });
    expect((await send('get', `/plans/${plan._id}/daily?date=${day.date}&timezone=Asia%2FShanghai`)).body.data.daily.completedCount).toBe(1);
    expect((await send('get', `/plans/${plan._id}/daily?date=2026-09-10&timezone=Asia%2FShanghai`)).body.data.daily.completedCount).toBe(0);
    expect((await daily(plan._id, { completed: false })).body.data.daily.completedCount).toBe(0);
    expect((await send('get', `/plans/${plan._id}`)).body.data.plan.morning[0].completed).toBe(true);
    expect((await daily(plan._id, {}, foreign)).status).toBe(404);
    expect((await daily(plan._id, { step: 99 })).status).toBe(404);
  });

  test('calendar/timezone validation, alias normalization and concurrent independent step writes', async () => {
    const plan = await createPlan();
    for (const bad of [{ date: '2026-02-30' }, { timezone: 'Fake/Zone' }, { date: 'yesterday' }]) {
      expect((await daily(plan._id, bad)).status).toBe(400);
    }
    const responses = await Promise.all([daily(plan._id), daily(plan._id, { period: 'evening' }), daily(plan._id, { step: 2 })]);
    expect(responses.map((r) => r.status)).toEqual([200, 200, 200]);
    const result = await send('get', `/plans/${plan._id}/daily?date=${day.date}&timezone=PRC`);
    expect(result.status).toBe(200);
    expect(result.body.data.daily.completedCount).toBe(3);
    expect(result.body.data.daily.timezone).toBe('Asia/Shanghai');
    expect((await daily(plan._id, { timezone: 'UTC' })).status).toBe(409);
    expect(await DailyRoutine.countDocuments({ planId: plan._id })).toBe(1);
  });

  test('opening status supports old documents and legacy writes without conflating unopened and unknown', async () => {
    const inserted = await Product.collection.insertOne({ name: '旧产品', createdBy: owner._id, openingDate: new Date('2026-09-01') });
    const id = inserted.insertedId;
    expect((await send('get', `/products/${id}`)).body.data.product.openingStatus).toBe('opened');
    expect((await send('put', `/products/${id}`, { openingStatus: 'unopened' })).body.data.product).toMatchObject({ openingStatus: 'unopened', openingDate: null });
    expect((await send('put', `/products/${id}`, { openingDate: '2026-09-02' })).body.data.product.openingStatus).toBe('opened');
    expect((await send('put', `/products/${id}`, { openingDate: null })).body.data.product.openingStatus).toBe('unknown');
    const created = await send('post', '/products', { name: '新品', openingStatus: 'unopened' });
    expect(created.status).toBe(201);
    expect(created.body.data.product.openingStatus).toBe('unopened');
    expect((await send('get', `/products/user/${owner._id}`)).body.data.products.every((p) => p.openingStatus)).toBe(true);
  });

  test('context patches merge independent annotations and cannot alter AI assessments or another user record', async () => {
    const inserted = await SkinAnalysis.collection.insertOne({ createdBy: owner._id, imageUrl: 'old', storageKey: 'face/key', overallAssessment: { healthScore: 80 } });
    const path = `/skin-analysis/${inserted.insertedId}/context`;
    expect((await send('patch', path, { condition: '洁面后', feelings: ['紧绷'] })).status).toBe(200);
    const patched = await send('patch', path, { light: '自然光', overallAssessment: { healthScore: 100 } });
    expect(patched.body.data.analysis.context).toEqual({ condition: '洁面后', light: '自然光', feelings: ['紧绷'] });
    expect(patched.body.data.analysis.overallAssessment.healthScore).toBe(80);
    expect(patched.body.data.analysis.storageKey).toBeUndefined();
    expect(patched.body.data.analysis.imageUrl).toBe('signed://private');
    expect((await send('patch', path, { condition: '偷改' }, foreign)).status).toBe(404);
    expect((await send('patch', path, {})).status).toBe(400);
  });

  test('conflict snapshots preserve original product names and ingredients after edit or deletion', async () => {
    const products = await Product.create([{ name: '旧精华', ingredients: ['烟酰胺'], createdBy: owner._id }, { name: '旧乳霜', ingredients: ['透明质酸'], createdBy: owner._id }]);
    const analyzed = await send('post', '/conflicts', { productIds: products.map((p) => String(p._id)) });
    expect(analyzed.status).toBe(201);
    await Product.updateOne({ _id: products[0]._id }, { name: '已改名', ingredients: ['其他'] });
    await Product.deleteOne({ _id: products[1]._id });
    const result = await send('get', `/conflicts/${analyzed.body.data.conflictId}`);
    expect(result.status).toBe(200);
    expect(result.body.data.conflict.products.map((p) => p.name).sort()).toEqual(['旧乳霜', '旧精华'].sort());
    expect(result.body.data.conflict.products.find((p) => p.name === '旧精华').ingredients).toEqual(['烟酰胺']);
    expect((await send('get', `/conflicts/user/${owner._id}`)).body.data.conflicts[0].products).toHaveLength(2);
    // Old records cannot reconstruct deleted products but must remain readable.
    const legacy = await Conflict.create({ products: products.map((p) => p._id), createdBy: owner._id });
    expect((await send('get', `/conflicts/${legacy._id}`)).status).toBe(200);
  });

  test('account cleanup also removes daily data', async () => {
    const plan = await createPlan(); await daily(plan._id);
    await createAccountDeletionService({ storageProvider: storage }).deleteAll(owner._id);
    expect(await DailyRoutine.countDocuments({ createdBy: owner._id })).toBe(0);
  });
  test('legacy other-issues arrays remain readable without rewriting stored source observations', async () => {
    const original = { redness: ['鼻翼两侧轻微泛红'], texture: ['脸颊细小纹理'] };
    const record = await SkinAnalysis.collection.insertOne({ createdBy: owner._id, imageUrl: 'old',
      storageKey: 'face/legacy', otherIssues: original, overallAssessment: { healthScore: 80 } });
    const response = await send('get', `/skin-analysis/${record.insertedId}`);
    expect(response.status).toBe(200);
    expect(response.body.data.analysis.otherIssues).toEqual({ observations: [
      { category: 'redness', details: original.redness }, { category: 'texture', details: original.texture }
    ] });
    const stored = await SkinAnalysis.collection.findOne({ _id: record.insertedId });
    expect(stored.otherIssues).toEqual(original);
  });

});
