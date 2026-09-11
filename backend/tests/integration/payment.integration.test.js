const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const { createRuntime } = require('../../src');
const PaymentOrder = require('../../src/models/paymentOrder.model');
const { ApiError } = require('../../src/middlewares/error');

// These tests use real loopback HTTP and a real temporary MongoDB process.
// Alipay is an explicit provider substitute: they do NOT prove real Alipay
// signatures, SDK payment, merchant permission, or receipt of a live callback.
describe('Alipay payment contract over real local HTTP and MongoDB (provider substitute)', () => {
  let mongo;
  let runtime;
  let base;
  let owner;
  let provider;
  let remoteOrders;
  let sequence = 0;

  const paymentDate = () => new Date(Date.now() + 8 * 60 * 60 * 1000)
    .toISOString().slice(0, 19).replace('T', ' ');

  const call = async (path, { method = 'GET', token, body, form } = {}) => {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (form) headers['Content-Type'] = 'application/x-www-form-urlencoded';
    const response = await fetch(`${base}/api/payments${path}`, {
      method,
      headers,
      body: form ? new URLSearchParams(form).toString() : body === undefined ? undefined : JSON.stringify(body)
    });
    const raw = await response.text();
    let parsed;
    try { parsed = JSON.parse(raw); } catch { parsed = undefined; }
    return { status: response.status, body: parsed, text: raw };
  };

  const register = async (phone) => {
    const response = await fetch(`${base}/api/users/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Payment fixture user', phone, password: 'fixture-password-123', gender: 'female' })
    });
    const body = await response.json();
    expect(response.status).toBe(201);
    return { token: body.token, id: body.data.user._id };
  };

  const createOrder = async ({ productId = 'member_month', idempotencyKey = `payment-fixture-${++sequence}` } = {}) => {
    const response = await call('/orders', {
      method: 'POST', token: owner.token, body: { productId, idempotencyKey }
    });
    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    return response.body.data;
  };

  const membership = async (token = owner.token) => {
    const response = await call('/membership', { token });
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.autoRenew).toBe(false);
    return response.body.data;
  };

  const markPaid = (order) => {
    const previous = remoteOrders.get(order.outTradeNo);
    const paid = {
      ...previous,
      tradeNo: previous.tradeNo || `20260910${String(++sequence).padStart(20, '0')}`,
      tradeStatus: 'TRADE_SUCCESS',
      sendPayDate: paymentDate()
    };
    remoteOrders.set(order.outTradeNo, paid);
    return paid;
  };

  const notification = (order, overrides = {}) => {
    const remote = remoteOrders.get(order.outTradeNo);
    return {
      notify_id: `fixture-notification-${++sequence}`,
      notify_time: paymentDate(),
      app_id: provider.appId,
      seller_id: provider.sellerId,
      out_trade_no: order.outTradeNo,
      trade_no: remote.tradeNo || `20260910${String(++sequence).padStart(20, '0')}`,
      total_amount: remote.totalAmount,
      trade_status: remote.tradeStatus,
      gmt_payment: remote.sendPayDate || paymentDate(),
      sign_type: 'RSA2',
      sign: 'fixture-valid-signature',
      ...overrides
    };
  };

  const notify = (form) => call('/alipay/notify', { method: 'POST', form });
  const expectAcknowledged = (response) => {
    expect(response.status).toBe(200);
    expect(response.text).toBe('success');
  };

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    provider = {
      configured: true,
      environment: 'sandbox',
      appId: '2026000000000000',
      sellerId: '2088000000000000',
      createAppPayment: jest.fn(),
      verifyNotification: jest.fn(),
      queryOrder: jest.fn(),
      closeOrder: jest.fn()
    };
    runtime = createRuntime({
      env: {
        NODE_ENV: 'test', PORT: '0', BIND_HOST: '127.0.0.1',
        MONGODB_URI: mongo.getUri(),
        JWT_SECRET: 'payment-integration-secret-with-at-least-32-characters',
        ALIPAY_ENABLED: 'true', ALIPAY_ENVIRONMENT: 'sandbox',
        MEMBERSHIP_MONTH_PRICE_FEN: '1200', MEMBERSHIP_YEAR_PRICE_FEN: '8800'
      },
      overrides: {
        alipayProvider: provider,
        logger: { info: jest.fn(), error: jest.fn() },
        appleVerifier: { verify: async () => ({ sub: 'unused-payment-fixture' }) },
        appleOAuthClient: { exchangeCode: async () => ({ refreshToken: 'unused' }), revokeRefreshToken: async () => undefined },
        storageProvider: { deleteObject: async () => undefined },
        aiProvider: {},
        passwordResetSender: { sendCode: async () => undefined }
      }
    });
    await runtime.start();
    const address = runtime.server.address();
    expect(address.address).toBe('127.0.0.1');
    base = `http://127.0.0.1:${address.port}`;
    await PaymentOrder.init();
  });

  beforeEach(async () => {
    for (const collection of Object.values(mongoose.connection.collections)) await collection.deleteMany({});
    remoteOrders = new Map();
    provider.createAppPayment.mockReset().mockImplementation(async ({ outTradeNo, totalAmount }) => {
      if (!remoteOrders.has(outTradeNo)) {
        remoteOrders.set(outTradeNo, {
          code: '10000', outTradeNo, totalAmount, sellerId: provider.sellerId, tradeStatus: 'WAIT_BUYER_PAY',
          tradeNo: `20260910${String(++sequence).padStart(20, '0')}`
        });
      }
      return { orderString: `fixture-signed-order:${outTradeNo}` };
    });
    provider.verifyNotification.mockReset().mockImplementation(async (params) => params.sign === 'fixture-valid-signature');
    provider.queryOrder.mockReset().mockImplementation(async (input) => {
      const outTradeNo = typeof input === 'string' ? input : input.outTradeNo;
      const result = remoteOrders.get(outTradeNo);
      if (!result) throw new ApiError(404, 'fixture verified absent trade', 'PAYMENT_ORDER_NOT_FOUND');
      return result;
    });
    provider.closeOrder.mockReset().mockImplementation(async (outTradeNo) => {
      const remote = remoteOrders.get(outTradeNo);
      if (!remote || remote.tradeStatus !== 'WAIT_BUYER_PAY') {
        throw new ApiError(409, 'fixture close requires requery', 'PAYMENT_CLOSE_RECHECK');
      }
      remoteOrders.set(outTradeNo, { ...remote, tradeStatus: 'TRADE_CLOSED' });
      return { code: '10000', outTradeNo, tradeNo: remote.tradeNo };
    });
    owner = await register('13900000771');
  });

  afterAll(async () => {
    if (runtime) await runtime.stop();
    if (mongo) await mongo.stop();
  });

  test('requires authentication and publishes the server-owned product catalogue', async () => {
    for (const path of ['/catalog', '/membership']) expect((await call(path)).status).toBe(401);
    expect((await call('/orders', { method: 'POST', body: { productId: 'member_month', idempotencyKey: 'anonymous-order' } })).status).toBe(401);
    const catalog = await call('/catalog', { token: owner.token });
    expect(catalog.status).toBe(200);
    expect(catalog.body.data).toMatchObject({ provider: 'alipay', environment: 'sandbox', available: true });
    expect(catalog.body.data.products).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'member_month', amountFen: 1200, currency: 'CNY', durationMonths: 1 }),
      expect.objectContaining({ id: 'member_year', amountFen: 8800, currency: 'CNY', durationMonths: 12 })
    ]));
    expect(await membership()).toMatchObject({ tier: 'free', validUntil: null });
  });

  test('creates a payable order without granting rights and never trusts a client price', async () => {
    const tampered = await call('/orders', {
      method: 'POST', token: owner.token,
      body: { productId: 'member_month', idempotencyKey: 'tampered-price', amountFen: 1, totalAmount: '0.01' }
    });
    // Both rejecting extra fields and ignoring them are safe policies.
    if (tampered.status === 201) expect(tampered.body.data.order.amountFen).toBe(1200);
    else expect(tampered.status).toBe(400);
    const { order, payment } = await createOrder();
    expect(order).toMatchObject({ id: expect.any(String), outTradeNo: expect.any(String), productId: 'member_month', amountFen: 1200, currency: 'CNY' });
    expect(new Date(order.expiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(payment.orderString).toEqual(expect.any(String));
    expect(provider.createAppPayment).toHaveBeenCalledWith(expect.objectContaining({ outTradeNo: order.outTradeNo, totalAmount: '12.00' }));
    const fetched = await call(`/orders/${order.id}`, { token: owner.token });
    expect(fetched.status).toBe(200);
    expect(fetched.body.data.order.id).toBe(order.id);
    expect(await membership()).toMatchObject({ tier: 'free', validUntil: null });
  });

  test('retries and concurrent creates share one order for a user idempotency key', async () => {
    const request = { method: 'POST', token: owner.token, body: { productId: 'member_month', idempotencyKey: 'same-logical-purchase' } };
    const responses = await Promise.all([call('/orders', request), call('/orders', request), call('/orders', request)]);
    for (const response of responses) expect([200, 201]).toContain(response.status);
    const ids = responses.map((response) => response.body.data.order.id);
    expect(new Set(ids).size).toBe(1);
    expect(await PaymentOrder.countDocuments()).toBe(1);
    expect(await membership()).toMatchObject({ tier: 'free' });
    const conflict = await call('/orders', { ...request, body: { ...request.body, productId: 'member_year' } });
    expect(conflict.status).toBe(409);
    expect(conflict.body.code).toBe('PAYMENT_IDEMPOTENCY_CONFLICT');
  });

  test('isolates order reads and refreshes from another authenticated user', async () => {
    const { order } = await createOrder();
    const stranger = await register('13900000772');
    for (const [method, path] of [['GET', `/orders/${order.id}`], ['POST', `/orders/${order.id}/refresh`]]) {
      expect((await call(path, { method, token: stranger.token })).status).toBe(404);
    }
    expect(provider.queryOrder).not.toHaveBeenCalled();
    expect(await membership(stranger.token)).toMatchObject({ tier: 'free' });
  });

  test('confirms payment by merchant query and repeated refresh never extends the same purchase twice', async () => {
    const { order } = await createOrder();
    markPaid(order);
    const refresh = await call(`/orders/${order.id}/refresh`, { method: 'POST', token: owner.token });
    expect(refresh.status).toBe(200);
    const first = await membership();
    expect(first).toMatchObject({ tier: 'member', provider: 'alipay' });
    expect(new Date(first.validUntil).getTime()).toBeGreaterThan(Date.now() + 27 * 86400000);
    await call(`/orders/${order.id}/refresh`, { method: 'POST', token: owner.token });
    expect((await membership()).validUntil).toBe(first.validUntil);
  });

  test('accepts a verified callback without JWT and concurrent duplicates grant one period', async () => {
    const { order } = await createOrder();
    markPaid(order);
    const form = notification(order);
    const responses = await Promise.all([notify(form), notify(form), notify(form)]);
    responses.forEach(expectAcknowledged);
    const first = await membership();
    expect(first.tier).toBe('member');
    expect(new Date(first.validUntil).getTime()).toBeLessThan(Date.now() + 32 * 86400000);
    expectAcknowledged(await notify({ ...form, notify_id: 'new-notify-id-same-paid-transaction' }));
    await call(`/orders/${order.id}/refresh`, { method: 'POST', token: owner.token });
    expect((await membership()).validUntil).toBe(first.validUntil);
    expect(await PaymentOrder.countDocuments()).toBe(1);
  });

  test('a second independently paid order extends membership once', async () => {
    const firstOrder = (await createOrder()).order;
    markPaid(firstOrder);
    expectAcknowledged(await notify(notification(firstOrder)));
    const firstEnd = new Date((await membership()).validUntil).getTime();
    const secondOrder = (await createOrder()).order;
    markPaid(secondOrder);
    expectAcknowledged(await notify(notification(secondOrder)));
    const secondEnd = new Date((await membership()).validUntil).getTime();
    expect(secondEnd).toBeGreaterThan(firstEnd + 27 * 86400000);
    expectAcknowledged(await notify(notification(secondOrder)));
    expect(new Date((await membership()).validUntil).getTime()).toBe(secondEnd);
  });

  test('rejects an invalid signature before query or entitlement mutation', async () => {
    const { order } = await createOrder();
    markPaid(order);
    const response = await notify(notification(order, { sign: 'fixture-invalid-signature' }));
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('PAYMENT_INVALID_SIGNATURE');
    expect(provider.queryOrder).not.toHaveBeenCalled();
    expect(await membership()).toMatchObject({ tier: 'free' });
  });

  test.each([
    ['application', { app_id: '2026999999999999' }],
    ['merchant', { seller_id: '2088999999999999' }],
    ['amount', { total_amount: '0.01' }],
    ['transaction', { trade_no: '202609109999999999999999999999' }]
  ])('rejects a signed callback with a mismatched %s', async (_name, overrides) => {
    const { order } = await createOrder();
    markPaid(order);
    const response = await notify(notification(order, overrides));
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('PAYMENT_MISMATCH');
    expect(await membership()).toMatchObject({ tier: 'free' });
  });

  test('rejects a queried order with the wrong amount or seller', async () => {
    const { order } = await createOrder();
    const remote = markPaid(order);
    for (const mismatch of [{ totalAmount: '0.01' }, { sellerId: '2088999999999999' }]) {
      remoteOrders.set(order.outTradeNo, { ...remote, ...mismatch });
      const response = await call(`/orders/${order.id}/refresh`, { method: 'POST', token: owner.token });
      expect(response.status).toBe(400);
      expect(response.body.code).toBe('PAYMENT_MISMATCH');
      expect(await membership()).toMatchObject({ tier: 'free' });
    }
  });

  test('a callback claiming success cannot grant rights while the merchant query is unpaid', async () => {
    const { order } = await createOrder();
    const response = await notify(notification(order, { trade_status: 'TRADE_SUCCESS' }));
    expect(response.status).not.toBeGreaterThanOrEqual(500);
    expect(await membership()).toMatchObject({ tier: 'free', validUntil: null });
    const refresh = await call(`/orders/${order.id}/refresh`, { method: 'POST', token: owner.token });
    expect(refresh.status).toBe(200);
    expect(await membership()).toMatchObject({ tier: 'free' });
  });

  test('query outages never grant rights and a subsequent genuine confirmation can recover', async () => {
    const { order } = await createOrder();
    markPaid(order);
    provider.queryOrder.mockRejectedValueOnce(new Error('fixture upstream outage'));
    const failed = await notify(notification(order));
    expect(failed.status).toBeGreaterThanOrEqual(500);
    expect(failed.text).not.toBe('success');
    expect(await membership()).toMatchObject({ tier: 'free' });
    expectAcknowledged(await notify(notification(order)));
    expect((await membership()).tier).toBe('member');
  });

  test('full refund revokes this purchase and stale successful callbacks cannot revive it', async () => {
    const { order } = await createOrder();
    markPaid(order);
    const oldSuccess = notification(order);
    expectAcknowledged(await notify(oldSuccess));
    expect((await membership()).tier).toBe('member');
    const closed = { ...remoteOrders.get(order.outTradeNo), tradeStatus: 'TRADE_CLOSED' };
    remoteOrders.set(order.outTradeNo, closed);
    expectAcknowledged(await notify(notification(order, {
      refund_fee: '12.00', gmt_refund: paymentDate(), out_biz_no: 'fixture-full-refund'
    })));
    expect((await membership()).tier).toBe('free');
    // Even if a later query is stale too, a persisted full refund is terminal.
    remoteOrders.set(order.outTradeNo, { ...closed, tradeStatus: 'TRADE_SUCCESS' });
    expectAcknowledged(await notify(oldSuccess));
    await call(`/orders/${order.id}/refresh`, { method: 'POST', token: owner.token });
    expect((await membership()).tier).toBe('free');
  });

  test('partial refunds keep the period and cumulative full refund revokes it despite out-of-order notifications', async () => {
    const { order } = await createOrder();
    markPaid(order);
    expectAcknowledged(await notify(notification(order)));
    const first = await membership();
    for (const refundFee of ['3.00', '2.00']) {
      expectAcknowledged(await notify(notification(order, {
        refund_fee: refundFee, gmt_refund: paymentDate(), out_biz_no: `fixture-partial-${refundFee}`
      })));
      expect((await membership()).validUntil).toBe(first.validUntil);
    }
    remoteOrders.set(order.outTradeNo, { ...remoteOrders.get(order.outTradeNo), tradeStatus: 'TRADE_CLOSED' });
    expectAcknowledged(await notify(notification(order, {
      refund_fee: '12.00', gmt_refund: paymentDate(), out_biz_no: 'fixture-cumulative-full'
    })));
    expect((await membership()).tier).toBe('free');
  });

  test('an expired paid period no longer grants membership and replay does not renew it', async () => {
    const { order } = await createOrder();
    markPaid(order);
    const paidNotification = notification(order);
    expectAcknowledged(await notify(paidNotification));
    expect((await membership()).tier).toBe('member');
    // Construct an already elapsed ledger period without mocking clocks or
    // waiting. PaymentOrder is the service's declared entitlement ledger.
    await PaymentOrder.updateOne({ _id: order.id }, { $set: { paidAt: new Date(Date.now() - 730 * 86400000) } });
    expect((await membership()).tier).toBe('free');
    expectAcknowledged(await notify(paidNotification));
    expect((await membership()).tier).toBe('free');
  });

  test('deleting an account detaches its payment ledger and old callbacks cannot grant rights to a new account', async () => {
    const { order } = await createOrder();
    markPaid(order);
    const oldNotification = notification(order);
    expectAcknowledged(await notify(oldNotification));
    const exposed = await call(`/orders/${order.id}`, { token: owner.token });
    for (const field of ['owner', 'appId', 'sellerId', 'tradeNo', 'idempotencyKey', 'sign', 'privateKey', 'rawNotification']) {
      expect(exposed.body.data.order).not.toHaveProperty(field);
    }
    const deleted = await fetch(`${base}/api/users/delete-account`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${owner.token}` }
    });
    expect(deleted.status).toBe(200);
    expect((await PaymentOrder.findById(order.id).lean()).owner).toBeNull();
    expect((await call('/membership', { token: owner.token })).status).toBe(401);

    const replacement = await register('13900000771');
    expect(replacement.id).not.toBe(owner.id);
    expectAcknowledged(await notify(oldNotification));
    expect(await membership(replacement.token)).toMatchObject({ tier: 'free', validUntil: null });
    const inaccessible = await call(`/orders/${order.id}`, { token: replacement.token });
    expect(inaccessible.status).toBe(404);
    expect(inaccessible.text).not.toContain(order.outTradeNo);
    expect(inaccessible.text).not.toContain(oldNotification.trade_no);
    expect((await PaymentOrder.findById(order.id).lean()).owner).toBeNull();
  });

  test('membership discovers a full refund missed by callbacks once its verification cache is stale', async () => {
    const { order } = await createOrder();
    markPaid(order);
    expectAcknowledged(await notify(notification(order)));
    expect((await membership()).tier).toBe('member');
    await PaymentOrder.updateOne({ _id: order.id }, { $set: { lastVerifiedAt: new Date(Date.now() - 10 * 60000) } });
    remoteOrders.set(order.outTradeNo, { ...remoteOrders.get(order.outTradeNo), tradeStatus: 'TRADE_CLOSED' });
    provider.queryOrder.mockClear();
    const refreshed = await membership();
    expect(provider.queryOrder).toHaveBeenCalled();
    expect(refreshed.tier).toBe('free');
    expect((await PaymentOrder.findById(order.id).lean()).status).toBe('refunded');
  });

  test('an upstream outage cannot expose a stale paid cache as freshly verified active membership', async () => {
    const { order } = await createOrder();
    markPaid(order);
    expectAcknowledged(await notify(notification(order)));
    await PaymentOrder.updateOne({ _id: order.id }, { $set: { lastVerifiedAt: new Date(Date.now() - 10 * 60000) } });
    provider.queryOrder.mockRejectedValueOnce(new Error('fixture membership refresh outage'));
    const response = await call('/membership', { token: owner.token });
    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(response.body.success).toBe(false);
    expect(response.body.data?.tier).not.toBe('member');
    // A temporary upstream failure does not erase the verified payment ledger.
    expect((await PaymentOrder.findById(order.id).lean()).status).toBe('paid');
    expect((await membership()).tier).toBe('member');
  });

  test('a production ledger entry cannot grant membership in the sandbox environment', async () => {
    const { order } = await createOrder();
    markPaid(order);
    expectAcknowledged(await notify(notification(order)));
    expect((await membership()).tier).toBe('member');
    await PaymentOrder.updateOne({ _id: order.id }, { $set: { environment: 'production' } });
    provider.queryOrder.mockClear();
    expect(await membership()).toMatchObject({ tier: 'free', validUntil: null });
    expect((await call(`/orders/${order.id}`, { token: owner.token })).status).toBe(404);
    expect(provider.queryOrder).not.toHaveBeenCalled();
  });

  test('only an expired order plus verified absence releases an unlaunched payment, including idempotent retry', async () => {
    const key = 'never-launched-expired-order';
    const { order } = await createOrder({ idempotencyKey: key });
    remoteOrders.delete(order.outTradeNo);
    const refresh = () => call(`/orders/${order.id}/refresh`, { method: 'POST', token: owner.token });
    expect((await refresh()).body.data.order.status).toBe('pending');
    await PaymentOrder.updateOne({ _id: order.id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    const retried = await createOrder({ idempotencyKey: key });
    expect(retried.order).toMatchObject({ id: order.id, status: 'closed' });
    expect(retried.payment).toBeNull();
    expect((await refresh()).body.data.order.status).toBe('closed');
    expect((await PaymentOrder.findById(order.id)).closeReason).toBe('expired_not_found');
    expect(provider.closeOrder).not.toHaveBeenCalled();
    expect(await membership()).toMatchObject({ tier: 'free' });
    expect((await createOrder()).order.id).not.toBe(order.id);
  });

  test('late verified payment revives an expired-absent order and grants only one membership period', async () => {
    const { order } = await createOrder();
    const remote = remoteOrders.get(order.outTradeNo);
    await PaymentOrder.updateOne({ _id: order.id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    remoteOrders.delete(order.outTradeNo);
    expect((await call(`/orders/${order.id}/refresh`, { method: 'POST', token: owner.token })).body.data.order.status).toBe('closed');
    remoteOrders.set(order.outTradeNo, remote);
    markPaid(order);
    expectAcknowledged(await notify(notification(order)));
    expect((await PaymentOrder.findById(order.id)).status).toBe('paid');
    expect((await PaymentOrder.findById(order.id)).closeReason).toBeNull();
    const first = await membership();
    expect(first.tier).toBe('member');
    expectAcknowledged(await notify(notification(order)));
    expect((await membership()).validUntil).toBe(first.validUntil);
  });

  test('expiry cleanup cannot overwrite a concurrently confirmed paid order', async () => {
    const { order } = await createOrder();
    await PaymentOrder.updateOne({ _id: order.id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    let releaseQuery;
    let queryStarted;
    const started = new Promise((resolve) => { queryStarted = resolve; });
    const release = new Promise((resolve) => { releaseQuery = resolve; });
    provider.queryOrder.mockImplementationOnce(async () => {
      queryStarted();
      await release;
      throw new ApiError(404, 'fixture delayed absent answer', 'PAYMENT_ORDER_NOT_FOUND');
    });
    const refresh = call(`/orders/${order.id}/refresh`, { method: 'POST', token: owner.token });
    await started;
    try {
      markPaid(order);
      expectAcknowledged(await notify(notification(order)));
    } finally { releaseQuery(); }
    expect((await refresh).body.data.order.status).toBe('paid');
    expect((await membership()).tier).toBe('member');
  });

  test('closes an expired existing unpaid trade at Alipay before releasing it and keeps provider closure terminal', async () => {
    const { order } = await createOrder();
    await PaymentOrder.updateOne({ _id: order.id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    const response = await call(`/orders/${order.id}/refresh`, { method: 'POST', token: owner.token });
    expect(response.status).toBe(200);
    expect(response.body.data.order.status).toBe('closed');
    expect(provider.closeOrder).toHaveBeenCalledWith(order.outTradeNo);
    expect((await PaymentOrder.findById(order.id)).closeReason).toBe('provider_closed');
    // A stale query claiming paid must not resurrect confirmed provider closure.
    markPaid(order);
    expect((await call(`/orders/${order.id}/refresh`, { method: 'POST', token: owner.token })).body.data.order.status).toBe('closed');
    expect((await membership()).tier).toBe('free');
  });

  test('payment winning the close race is queried again and recorded as paid', async () => {
    const { order } = await createOrder();
    await PaymentOrder.updateOne({ _id: order.id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    provider.closeOrder.mockImplementationOnce(async () => {
      markPaid(order);
      throw new ApiError(409, 'fixture paid while closing', 'PAYMENT_CLOSE_RECHECK');
    });
    const response = await call(`/orders/${order.id}/refresh`, { method: 'POST', token: owner.token });
    expect(response.status).toBe(200);
    expect(response.body.data.order.status).toBe('paid');
    expect(provider.queryOrder).toHaveBeenCalledTimes(2);
    expect((await membership()).tier).toBe('member');
  });

  test.each(['query', 'close', 'close-still-waiting'])('an expired order remains pending on uncertain %s evidence', async (stage) => {
    const { order } = await createOrder();
    await PaymentOrder.updateOne({ _id: order.id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    if (stage === 'query') provider.queryOrder.mockRejectedValueOnce(new ApiError(502, 'fixture unsigned response', 'PAYMENT_PROVIDER_ERROR'));
    if (stage === 'close') provider.closeOrder.mockRejectedValueOnce(new ApiError(504, 'fixture timeout', 'PAYMENT_PROVIDER_TIMEOUT'));
    if (stage === 'close-still-waiting') provider.closeOrder.mockRejectedValueOnce(new ApiError(409, 'fixture changed', 'PAYMENT_CLOSE_RECHECK'));
    const response = await call(`/orders/${order.id}/refresh`, { method: 'POST', token: owner.token });
    expect(response.status).toBeGreaterThanOrEqual(500);
    const persisted = await PaymentOrder.findById(order.id);
    expect(persisted.status).toBe('pending');
    expect(persisted.closeReason).toBeNull();
  });

  test('a notification of a missing expired trade remains retryable instead of being acknowledged as closure', async () => {
    const { order } = await createOrder();
    const form = notification(order, { trade_status: 'TRADE_SUCCESS' });
    await PaymentOrder.updateOne({ _id: order.id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    remoteOrders.delete(order.outTradeNo);
    const response = await notify(form);
    expect(response.status).toBe(503);
    expect(response.text).not.toBe('success');
    expect((await PaymentOrder.findById(order.id)).status).toBe('pending');
  });
});
