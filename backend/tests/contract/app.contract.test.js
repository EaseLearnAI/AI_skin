const request = require('supertest');

const { createApp } = require('../../src/app');

describe('application contract', () => {
  test('exposes process and readiness probes without starting a listener', async () => {
    const app = createApp({ readinessCheck: async () => false });

    const health = await request(app).get('/health');
    const ready = await request(app).get('/ready');

    expect(health.status).toBe(200);
    expect(health.body).toEqual({ success: true, status: 'ok' });
    expect(ready.status).toBe(503);
    expect(ready.body).toMatchObject({ success: false, status: 'not_ready' });
  });

  test('preserves the root response and returns a safe 404 envelope', async () => {
    const app = createApp({ readinessCheck: async () => true });

    const home = await request(app).get('/');
    const missing = await request(app).get('/does-not-exist');

    expect(home.status).toBe(200);
    expect(home.body).toEqual({ message: 'Welcome to AI Skincare System API - 皮肤分析功能已启用' });
    expect(missing.status).toBe(404);
    expect(missing.body).toMatchObject({
      success: false,
      message: '接口不存在'
    });
    expect(missing.body.requestId).toEqual(expect.any(String));
  });

  test('keeps an incoming request id for end-to-end tracing', async () => {
    const app = createApp({ readinessCheck: async () => true });

    const response = await request(app)
      .get('/health')
      .set('X-Request-ID', 'ios-request-123');

    expect(response.headers['x-request-id']).toBe('ios-request-123');
  });

  test('adds baseline security headers without advertising Express', async () => {
    const app = createApp({ readinessCheck: async () => true });

    const response = await request(app).get('/health');

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  test('emits one structured request record without headers or tokens', async () => {
    const logger = { info: jest.fn(), error: jest.fn() };
    const app = createApp({ readinessCheck: async () => true, logger });

    await request(app).get('/health').set('Authorization', 'Bearer must-not-be-logged');

    expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({
      event: 'http_request',
      method: 'GET',
      path: '/health',
      statusCode: 200,
      requestId: expect.any(String),
      durationMs: expect.any(Number)
    }));
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain('must-not-be-logged');
  });
});
