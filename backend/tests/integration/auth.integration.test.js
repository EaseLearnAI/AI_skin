const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const { createApp } = require('../../src/app');
const { createApiRouter } = require('../../src/routes');
const { createAuthService } = require('../../src/services/auth.service');
const { ApiError } = require('../../src/middlewares/error');
const User = require('../../src/models/user.model');

describe('authentication flows', () => {
  let mongo;
  let app;
  let appleOAuthClient;
  let passwordResetSender;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
  }, 60000);

  beforeEach(async () => {
    await mongoose.connection.db.dropDatabase();

    const appleVerifier = {
      verify: jest.fn(async ({ identityToken, rawNonce }) => {
        if (identityToken === 'invalid-token') {
          throw new ApiError(401, 'Apple 凭证无效', 'APPLE_TOKEN_INVALID');
        }
        expect(rawNonce).toBe('raw-nonce');
        return { sub: identityToken === 'linked-token' ? 'apple-linked-sub' : 'apple-sub-1' };
      })
    };
    appleOAuthClient = {
      exchangeCode: jest.fn(async () => ({ refreshToken: 'apple-refresh-token' })),
      revokeRefreshToken: jest.fn(async () => undefined)
    };
    passwordResetSender = { sendCode: jest.fn(async () => undefined) };

    const authService = createAuthService({
      jwtSecret: 'integration-test-secret-with-at-least-32-characters',
      jwtExpiresIn: '1h',
      appleVerifier,
      appleOAuthClient,
      passwordResetSender,
      passwordResetCodeGenerator: () => '123456',
      refreshTokenEncryptionKey: 'integration-test-apple-encryption-key'
    });
    app = createApp({
      router: createApiRouter({ authService }),
      readinessCheck: async () => mongoose.connection.readyState === 1
    });
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });

  test('keeps phone registration, login and current-user response compatible', async () => {
    const registration = await request(app).post('/api/users/register').send({
      name: '测试用户',
      phone: '13900000001',
      password: 'password123',
      gender: 'female'
    });

    expect(registration.status).toBe(201);
    expect(registration.body).toMatchObject({
      success: true,
      message: '用户注册成功',
      data: { user: { name: '测试用户', phone: '13900000001', gender: 'female' } }
    });
    expect(registration.body.token).toEqual(expect.any(String));
    expect(registration.body.data.user.password).toBeUndefined();

    const login = await request(app).post('/api/users/login').send({
      phone: '13900000001',
      password: 'password123'
    });
    const me = await request(app)
      .get('/api/users/me')
      .set('Authorization', `Bearer ${login.body.token}`);

    expect(login.status).toBe(200);
    expect(me.status).toBe(200);
    expect(me.body.data.user.phone).toBe('13900000001');
  });

  test('rejects duplicate phones and malformed phone registration', async () => {
    const payload = {
      name: '测试用户', phone: '13900000002', password: 'password123', gender: 'male'
    };
    await request(app).post('/api/users/register').send(payload);

    const duplicate = await request(app).post('/api/users/register').send(payload);
    const malformed = await request(app).post('/api/users/register').send({
      ...payload,
      phone: 'not-a-phone'
    });

    expect(duplicate.status).toBe(400);
    expect(duplicate.body.message).toBe('该手机号已被注册');
    expect(malformed.status).toBe(400);
    expect(malformed.body.code).toBe('VALIDATION_ERROR');
  });

  test('uses one Apple endpoint for first registration and later login', async () => {
    const payload = {
      identityToken: 'valid-apple-token',
      authorizationCode: 'one-time-code',
      rawNonce: 'raw-nonce'
    };
    const first = await request(app).post('/api/users/apple').send(payload);
    const second = await request(app).post('/api/users/apple').send(payload);

    expect(first.status).toBe(200);
    expect(first.body.data.user.name).toEqual(expect.any(String));
    expect(first.body.data.user.name.length).toBeGreaterThan(0);
    expect(first.body.data.user.phone).toBeUndefined();
    expect(second.status).toBe(200);
    expect(second.body.data.user._id).toBe(first.body.data.user._id);
    expect(await User.countDocuments({ appleSubject: 'apple-sub-1' })).toBe(1);
    expect(appleOAuthClient.exchangeCode).toHaveBeenCalledTimes(1);
  });

  test('rejects an invalid Apple token without creating a user', async () => {
    const response = await request(app).post('/api/users/apple').send({
      identityToken: 'invalid-token',
      authorizationCode: 'one-time-code',
      rawNonce: 'raw-nonce'
    });

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('APPLE_TOKEN_INVALID');
    expect(await User.countDocuments()).toBe(0);
  });

  test('links Apple to the authenticated phone account without creating a duplicate', async () => {
    const registration = await request(app).post('/api/users/register').send({
      name: '绑定用户', phone: '13900000003', password: 'password123', gender: 'female'
    });
    const linked = await request(app)
      .post('/api/users/apple/link')
      .set('Authorization', `Bearer ${registration.body.token}`)
      .send({
        identityToken: 'linked-token',
        authorizationCode: 'one-time-code',
        rawNonce: 'raw-nonce'
      });
    const appleLogin = await request(app).post('/api/users/apple').send({
      identityToken: 'linked-token',
      authorizationCode: 'unused-on-existing-account',
      rawNonce: 'raw-nonce'
    });

    expect(linked.status).toBe(200);
    expect(appleLogin.body.data.user._id).toBe(registration.body.data.user._id);
    expect(await User.countDocuments()).toBe(1);
  });

  test('resets a phone password using a short-lived verification code', async () => {
    await request(app).post('/api/users/register').send({
      name: '重置用户', phone: '13900000004', password: 'old-password', gender: 'male'
    });

    const requested = await request(app).post('/api/users/password-reset/request').send({
      phone: '13900000004'
    });
    const confirmed = await request(app).post('/api/users/password-reset/confirm').send({
      phone: '13900000004',
      verificationCode: '123456',
      newPassword: 'new-password'
    });
    const oldLogin = await request(app).post('/api/users/login').send({
      phone: '13900000004', password: 'old-password'
    });
    const newLogin = await request(app).post('/api/users/login').send({
      phone: '13900000004', password: 'new-password'
    });

    expect(requested.status).toBe(200);
    expect(passwordResetSender.sendCode).toHaveBeenCalledWith('13900000004', '123456');
    expect(confirmed.status).toBe(200);
    expect(oldLogin.status).toBe(401);
    expect(newLogin.status).toBe(200);
  });

  test('does not reveal account existence when SMS delivery is unavailable', async () => {
    await request(app).post('/api/users/register').send({
      name: '中性提示用户', phone: '13900000005', password: 'password123', gender: 'female'
    });
    passwordResetSender.sendCode.mockRejectedValueOnce(new Error('gateway unavailable'));

    const existing = await request(app).post('/api/users/password-reset/request').send({ phone: '13900000005' });
    const unknown = await request(app).post('/api/users/password-reset/request').send({ phone: '13900000999' });

    expect(existing.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(existing.body.message).toBe(unknown.body.message);
  });

  test('updates profile fields and revokes the current token on logout', async () => {
    const registered = await request(app).post('/api/users/register').send({
      name: '资料用户', phone: '13900000006', password: 'password123', gender: 'female'
    });
    const headers = { Authorization: `Bearer ${registered.body.token}` };

    const name = await request(app).patch('/api/users/update-username').set(headers).send({ name: '新名字' });
    const age = await request(app).patch('/api/users/update-age').set(headers).send({ age: 30 });
    const cycle = await request(app).patch('/api/users/update-menstrual-cycle').set(headers).send({
      isInCycle: true, cycleDay: 2, cycleLength: 28
    });
    const gender = await request(app).patch('/api/users/update-gender').set(headers).send({ gender: 'male' });
    const stats = await request(app).get('/api/users/stats').set(headers);
    const logout = await request(app).post('/api/users/logout').set(headers);
    const me = await request(app).get('/api/users/me').set(headers);

    expect(name.body.data.user.name).toBe('新名字');
    expect(age.body.data.user.age).toBe(30);
    expect(cycle.body.data.user.menstrualCycle.cycleDay).toBe(2);
    expect(gender.body.data.user.gender).toBe('male');
    expect(stats.status).toBe(200);
    expect(logout.status).toBe(200);
    expect(me.status).toBe(401);
  });

  test('deletes an Apple account, revokes its token and invalidates the application JWT', async () => {
    const login = await request(app).post('/api/users/apple').send({
      identityToken: 'valid-apple-token',
      authorizationCode: 'one-time-code',
      rawNonce: 'raw-nonce'
    });
    const deleted = await request(app)
      .delete('/api/users/delete-account')
      .set('Authorization', `Bearer ${login.body.token}`);
    const me = await request(app)
      .get('/api/users/me')
      .set('Authorization', `Bearer ${login.body.token}`);

    expect(deleted.status).toBe(200);
    expect(appleOAuthClient.revokeRefreshToken).toHaveBeenCalledWith('apple-refresh-token');
    expect(await User.countDocuments()).toBe(0);
    expect(me.status).toBe(401);
  });
});
