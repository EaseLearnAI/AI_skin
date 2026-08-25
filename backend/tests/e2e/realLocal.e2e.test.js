const fs = require('fs/promises');
const path = require('path');
const { MongoMemoryServer } = require('mongodb-memory-server');

const { createRuntime } = require('../../src');

const describeReal = process.env.RUN_REAL_E2E === '1' ? describe : describe.skip;

describeReal('real local backend E2E', () => {
  jest.setTimeout(8 * 60 * 1000);

  let mongo;
  let runtime;
  let base;
  let token;
  let cleanupPhone;
  let cleanupPassword;

  const call = async (name, pathname, { method = 'GET', authToken = token, body, form } = {}, expected = 200) => {
    const headers = {};
    if (authToken) headers.Authorization = `Bearer ${authToken}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(`${base}${pathname}`, {
      method,
      headers,
      body: form || (body === undefined ? undefined : JSON.stringify(body))
    });
    const payload = await response.json();
    if (response.status !== expected) {
      throw new Error(`${name}: expected ${expected}, received ${response.status}: ${JSON.stringify(payload)}`);
    }
    console.log(JSON.stringify({ check: name, status: response.status, result: 'passed' }));
    return payload;
  };

  const imageForm = async (field, filename) => {
    const data = await fs.readFile(path.join(__dirname, '..', filename));
    const form = new FormData();
    form.append(field, new Blob([data], { type: filename.endsWith('.png') ? 'image/png' : 'image/jpeg' }), filename);
    return form;
  };

  beforeAll(async () => {
    for (const name of ['API_KEY', 'OSS_REGION', 'OSS_ACCESS_KEY_ID', 'OSS_ACCESS_KEY_SECRET', 'OSS_BUCKET']) {
      if (!process.env[name]) throw new Error(`${name} is required for the real E2E test`);
    }
    mongo = await MongoMemoryServer.create();
    runtime = createRuntime({
      env: {
        ...process.env,
        NODE_ENV: 'test',
        PORT: '0',
        MONGODB_URI: mongo.getUri(),
        JWT_SECRET: 'real-local-e2e-secret-with-at-least-32-characters',
        AI_TEXT_MODEL: 'qwen3.7-flash',
        AI_VISION_MODEL: 'qwen3-vl-plus',
        AI_OCR_MODEL: 'qwen-vl-ocr-latest',
        OSS_PRODUCT_IMAGES_PUBLIC: 'false'
      }
    });
    await runtime.start();
    base = `http://127.0.0.1:${runtime.server.address().port}`;
  });

  afterAll(async () => {
    if (runtime) await runtime.stop();
    if (mongo) await mongo.stop();
  });

  afterEach(async () => {
    if (!base || !cleanupPhone || !cleanupPassword) return;
    let cleanupToken = token;
    if (!cleanupToken) {
      const response = await fetch(`${base}/api/users/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: cleanupPhone, password: cleanupPassword })
      });
      if (response.ok) cleanupToken = (await response.json()).token;
    }
    if (cleanupToken) {
      const response = await fetch(`${base}/api/users/delete-account`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${cleanupToken}` }
      });
      if (response.ok) console.log(JSON.stringify({ check: 'failure cleanup', status: 200, result: 'passed' }));
    }
    token = undefined;
    cleanupPhone = undefined;
    cleanupPassword = undefined;
  });

  test('runs every critical phone-auth, OSS, AI and CRUD chain over real HTTP', async () => {
    const phone = `139${String(Date.now()).slice(-8)}`;
    const password = 'real-test-password-123';
    cleanupPhone = phone;
    cleanupPassword = password;
    let userId;
    const productIds = [];
    let conflictId;
    let planId;
    let analysisId;

    const health = await call('health', '/health', { authToken: null });
    expect(health).toEqual({ success: true, status: 'ok' });
    const ready = await call('ready', '/ready', { authToken: null });
    expect(ready).toEqual({ success: true, status: 'ready' });

    const invalidApple = await call('invalid Apple credential rejected', '/api/users/apple', {
      method: 'POST',
      authToken: null,
      body: {
        identityToken: 'invalid-local-token',
        authorizationCode: 'invalid-local-code',
        rawNonce: 'invalid-local-nonce'
      }
    }, 401);
    expect(invalidApple.code).toBe('APPLE_TOKEN_INVALID');

    const registration = await call('phone register', '/api/users/register', {
      method: 'POST',
      authToken: null,
      body: { name: '真实链路测试用户', phone, password, gender: 'female' }
    }, 201);
    userId = registration.data.user._id;

    const login = await call('phone login', '/api/users/login', {
      method: 'POST', authToken: null, body: { phone, password }
    });
    token = login.token;
    const me = await call('current user', '/api/users/me');
    expect(me.data.user.phone).toBe(phone);

    for (const name of ['真实测试精华一', '真实测试精华二']) {
      const created = await call(`create product ${name}`, '/api/products', {
        method: 'POST', body: { name, label: '精华' }
      }, 201);
      const productId = created.data.product._id;
      productIds.push(productId);
      await call(`upload product image ${name}`, `/api/products/${productId}/upload-image`, {
        method: 'POST', form: await imageForm('productImage', 'product.png')
      });
      const extracted = await call(`real OCR ${name}`, `/api/products/${productId}/extract-ingredients`, {
        method: 'POST', body: {}
      });
      expect(extracted.data.ingredients.length).toBeGreaterThan(5);
      expect(extracted.data.ingredients).toContain('1,3-丙二醇');
    }

    await call('rename comparison product', `/api/products/${productIds[1]}`, {
      method: 'PUT', body: { name: '同配方对照产品' }
    });

    const ingredient = await call('real ingredient analysis', `/api/products/${productIds[0]}/analyze-ingredients`, {
      method: 'POST', body: {}
    });
    expect(ingredient.data.ingredientAnalysis.safetyIndex).toEqual(expect.any(Number));

    const conflict = await call('real conflict analysis', '/api/conflicts', {
      method: 'POST', body: { productIds }
    }, 201);
    conflictId = conflict.data.conflictId;
    expect(conflict.data.recommendations).toEqual(expect.any(Object));

    const plan = await call('real plan generation', '/api/plans', {
      method: 'POST',
      body: { requirement: '基础保湿与温和修护', skinConcerns: ['干燥'], age: 28 }
    }, 201);
    planId = plan.data.plan._id;
    expect(plan.data.plan.morning.length).toBeGreaterThan(0);
    expect(plan.data.plan.evening.length).toBeGreaterThan(0);

    const skin = await call('real skin analysis', '/api/skin-analysis/analyze', {
      method: 'POST', form: await imageForm('faceImage', 'face.jpg')
    }, 201);
    analysisId = skin.data.analysisId;
    expect(skin.data.overallAssessment.healthScore).toEqual(expect.any(Number));
    expect(skin.data.analysisConfig.model).toBe('qwen3-vl-plus');

    const latest = await call('latest skin analysis', '/api/skin-analysis/latest');
    expect(latest.data.analysis._id).toBe(analysisId);
    const skinStats = await call('skin stats', '/api/skin-analysis/stats');
    expect(skinStats.data.stats.totalAnalyses).toBe(1);
    const productList = await call('product list', '/api/products?page=1&limit=10');
    expect(productList.data.products).toHaveLength(2);
    const conflictDetail = await call('conflict detail', `/api/conflicts/${conflictId}`);
    expect(conflictDetail.data.conflict._id).toBe(conflictId);
    const planDetail = await call('plan detail', `/api/plans/${planId}`);
    expect(planDetail.data.plan._id).toBe(planId);

    await call('delete conflict', `/api/conflicts/${conflictId}`, { method: 'DELETE' });
    await call('delete plan', `/api/plans/${planId}`, { method: 'DELETE' });
    await call('delete skin analysis and OSS object', `/api/skin-analysis/${analysisId}`, { method: 'DELETE' });
    for (const productId of productIds) {
      await call('delete product and OSS object', `/api/products/${productId}`, { method: 'DELETE' });
    }

    const oldToken = token;
    await call('logout', '/api/users/logout', { method: 'POST' });
    await call('revoked token rejected', '/api/users/me', { authToken: oldToken }, 401);
    const relogin = await call('phone relogin', '/api/users/login', {
      method: 'POST', authToken: null, body: { phone, password }
    });
    token = relogin.token;
    await call('delete account', '/api/users/delete-account', { method: 'DELETE' });
    await call('deleted account cannot login', '/api/users/login', {
      method: 'POST', authToken: null, body: { phone, password }
    }, 401);
    token = undefined;
    cleanupPhone = undefined;
    cleanupPassword = undefined;
    expect(userId).toEqual(expect.any(String));
  });
});
