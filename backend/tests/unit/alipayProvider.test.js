const { generateKeyPairSync, createSign, createVerify } = require('node:crypto');
// Alipay v4 has its own urllib v4; the existing OSS dependency uses another
// version. Intercept the SDK's actual transport so these tests never use HTTP.
const urllib = require(require.resolve('urllib', { paths: [require.resolve('alipay-sdk')] })).default;

const { createAlipayProvider } = require('../../src/providers/payment/alipayProvider');

const merchant = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' }
});
const alipay = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' }
});

const config = {
  enabled: true,
  environment: 'sandbox',
  appId: '2021000000000000',
  sellerId: '2088000000000000',
  privateKey: merchant.privateKey,
  alipayPublicKey: alipay.publicKey,
  keyType: 'PKCS8',
  notifyUrl: 'https://example.test/api/payments/alipay/notify',
  timeoutMs: 1000
};

const signature = (content, privateKey = alipay.privateKey) => createSign('RSA-SHA256')
  .update(content, 'utf8').sign(privateKey, 'base64');

const signNotification = (overrides = {}) => {
  const params = {
    app_id: config.appId,
    seller_id: config.sellerId,
    out_trade_no: 'order_001',
    trade_no: '20260910000001',
    total_amount: '12.00',
    trade_status: 'TRADE_SUCCESS',
    subject: '安心护肤 100% + 成分',
    sign_type: 'RSA2',
    ...overrides
  };
  const content = Object.keys(params).filter((key) => key !== 'sign_type').sort()
    .map((key) => `${key}=${params[key]}`).join('&');
  return { ...params, sign: signature(content) };
};

const queryResponse = (body, { tamper = false, unsigned = false, responseKey = 'alipay_trade_query_response' } = {}) => {
  const signedBody = JSON.stringify(body);
  const responseBody = tamper ? { ...body, total_amount: '999.00' } : body;
  return {
    status: 200,
    headers: { trace_id: 'local-test-trace' },
    data: JSON.stringify({
      [responseKey]: responseBody,
      ...(unsigned ? {} : { sign: signature(signedBody) })
    })
  };
};

const paidBody = {
  code: '10000',
  msg: 'Success',
  out_trade_no: 'order_001',
  trade_no: '20260910000001',
  total_amount: '12.00',
  trade_status: 'TRADE_SUCCESS',
  send_pay_date: '2026-09-10 11:00:00'
};

describe('Alipay provider using the official SDK with local RSA fixtures', () => {
  afterEach(() => jest.restoreAllMocks());

  test('disabled or incomplete credentials fail closed without starting SDK requests', async () => {
    const provider = createAlipayProvider({ ...config, alipayPublicKey: '' });
    expect(provider.configured).toBe(false);
    await expect(provider.queryOrder('order_001')).rejects.toMatchObject({
      statusCode: 503, code: 'PAYMENT_NOT_CONFIGURED'
    });
    expect(createAlipayProvider({ ...config, enabled: false }).configured).toBe(false);
    expect(createAlipayProvider({ ...config, environment: 'local' }).configured).toBe(false);
  });

  test('generates a verifiable RSA2 APP order with authoritative amount and absolute expiry', () => {
    const provider = createAlipayProvider(config);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    const { orderString: orderStr } = provider.createAppPayment({
      outTradeNo: 'order_001', subject: '安心护肤月度会员', totalAmount: '12.00', expiresAt
    });
    const params = Object.fromEntries(new URLSearchParams(orderStr));
    const content = Object.keys(params).filter((key) => key !== 'sign').sort()
      .map((key) => `${key}=${params[key]}`).join('&');
    expect(createVerify('RSA-SHA256').update(content, 'utf8')
      .verify(merchant.publicKey, params.sign, 'base64')).toBe(true);
    expect(params).toMatchObject({
      method: 'alipay.trade.app.pay', app_id: config.appId,
      sign_type: 'RSA2', notify_url: config.notifyUrl
    });
    const business = JSON.parse(params.biz_content);
    expect(business).toEqual({
      out_trade_no: 'order_001', subject: '安心护肤月度会员', total_amount: '12.00',
      product_code: 'QUICK_MSECURITY_PAY',
      time_expire: new Date(expiresAt.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ')
    });
    expect(orderStr).not.toContain('PRIVATE KEY');
  });

  test('can probe signed query credentials before a callback exists without selling a payable order', async () => {
    const provider = createAlipayProvider({ ...config, notifyUrl: '' });
    expect(provider.credentialsConfigured).toBe(true);
    expect(provider.configured).toBe(false);
    jest.spyOn(urllib, 'request').mockResolvedValue(queryResponse(paidBody));
    expect((await provider.queryOrder('order_001')).code).toBe('10000');
    expect(() => provider.createAppPayment({ outTradeNo: 'order_001', subject: '会员', totalAmount: '12.00',
      expiresAt: new Date(Date.now() + 100000) })).toThrow(expect.objectContaining({ code: 'PAYMENT_NOT_CONFIGURED' }));
  });

  test.each(['0', '0.00', '-12.00', '1e2', '12.001', ' 12.00', 12, '100000000.01'])(
    'rejects malformed or out-of-range money: %s', (totalAmount) => {
      expect(() => createAlipayProvider(config).createAppPayment({
        outTradeNo: 'order_001', subject: '会员', totalAmount,
        expiresAt: new Date(Date.now() + 100000)
      })).toThrow(expect.objectContaining({ code: 'PAYMENT_INVALID_ORDER' }));
    }
  );

  test('rejects expired orders and unsupported subject characters', () => {
    const provider = createAlipayProvider(config);
    const order = { outTradeNo: 'order_001', subject: '会员', totalAmount: '12.00' };
    expect(() => provider.createAppPayment({ ...order, expiresAt: new Date(0) }))
      .toThrow(expect.objectContaining({ code: 'PAYMENT_INVALID_ORDER' }));
    expect(() => provider.createAppPayment({
      ...order, subject: '会员&total_amount=0.01', expiresAt: new Date(Date.now() + 100000)
    })).toThrow(expect.objectContaining({ code: 'PAYMENT_INVALID_ORDER' }));
  });

  test('verifies a form-decoded notification once, preserving percent and plus characters', () => {
    const provider = createAlipayProvider(config);
    const params = signNotification();
    const formDecoded = Object.fromEntries(new URLSearchParams(new URLSearchParams(params).toString()));
    expect(provider.verifyNotification(formDecoded)).toBe(true);
    expect(provider.verifyNotification({ ...formDecoded, total_amount: '0.01' })).toBe(false);
    expect(provider.verifyNotification({ ...formDecoded, sign_type: 'RSA' })).toBe(false);
    expect(provider.verifyNotification({ ...formDecoded, sign: '' })).toBe(false);
    expect(provider.verifyNotification({ ...formDecoded, out_trade_no: ['order_001', 'order_002'] })).toBe(false);
    expect(provider.verifyNotification(null)).toBe(false);
  });

  test('wrong app or seller cannot pass provider verification even when correctly signed', () => {
    const provider = createAlipayProvider(config);
    expect(provider.verifyNotification(signNotification({ app_id: 'another-app' }))).toBe(false);
    expect(provider.verifyNotification(signNotification({ seller_id: 'another-seller' }))).toBe(false);
  });

  test('queries the fixed sandbox gateway and verifies the real signed response before returning camelCase', async () => {
    const request = jest.spyOn(urllib, 'request').mockResolvedValue(queryResponse(paidBody));
    const result = await createAlipayProvider(config).queryOrder('order_001');
    expect(result).toMatchObject({
      code: '10000', outTradeNo: 'order_001', tradeNo: '20260910000001',
      totalAmount: '12.00', tradeStatus: 'TRADE_SUCCESS', sendPayDate: '2026-09-10 11:00:00'
    });
    const [url, options] = request.mock.calls[0];
    expect(new URL(url).origin).toBe('https://openapi-sandbox.dl.alipaydev.com');
    expect(new URL(url).searchParams.get('method')).toBe('alipay.trade.query');
    expect(options.timeout).toBe(config.timeoutMs);
    expect(JSON.parse(options.data.biz_content)).toEqual({ out_trade_no: 'order_001' });
  });

  test.each([{ tamper: true }, { unsigned: true }])('never trusts an invalid response signature: %j', async (mode) => {
    jest.spyOn(urllib, 'request').mockResolvedValue(queryResponse(paidBody, mode));
    await expect(createAlipayProvider(config).queryOrder('order_001')).rejects.toMatchObject({
      statusCode: 502, code: 'PAYMENT_PROVIDER_ERROR', message: '支付宝服务暂时不可用，请稍后重试'
    });
  });

  test('maps only a signed trade-not-exist business response to order not found', async () => {
    const body = { code: '40004', msg: 'Business Failed', sub_code: 'ACQ.TRADE_NOT_EXIST' };
    const request = jest.spyOn(urllib, 'request').mockResolvedValue(queryResponse(body));
    await expect(createAlipayProvider(config).queryOrder('order_001')).rejects.toMatchObject({
      statusCode: 404, code: 'PAYMENT_ORDER_NOT_FOUND'
    });
    request.mockResolvedValue(queryResponse(body, { unsigned: true }));
    await expect(createAlipayProvider(config).queryOrder('order_001')).rejects.toMatchObject({
      code: 'PAYMENT_PROVIDER_ERROR'
    });
  });

  test('does not expose upstream error data or treat query business failure as payment success', async () => {
    jest.spyOn(urllib, 'request').mockResolvedValue(queryResponse({
      code: '40004', msg: 'Business Failed', sub_code: 'ACQ.SYSTEM_ERROR',
      sub_msg: 'private upstream detail must not escape'
    }));
    await expect(createAlipayProvider(config).queryOrder('order_001')).rejects.toMatchObject({
      code: 'PAYMENT_PROVIDER_ERROR', message: '支付宝服务暂时不可用，请稍后重试'
    });
  });

  test('maps SDK timeouts without leaking request details', async () => {
    jest.spyOn(urllib, 'request').mockRejectedValue(Object.assign(new Error('secret signed URL'), {
      code: 'UND_ERR_CONNECT_TIMEOUT'
    }));
    await expect(createAlipayProvider(config).queryOrder('order_001')).rejects.toMatchObject({
      statusCode: 504, code: 'PAYMENT_PROVIDER_TIMEOUT', message: '支付宝查询超时，请稍后重试'
    });
  });

  test('has an outer deadline even if an injected SDK never settles', async () => {
    const sdk = { exec: jest.fn(() => new Promise(() => {})) };
    await expect(createAlipayProvider({ ...config, timeoutMs: 10 }, { sdk }).queryOrder('order_001'))
      .rejects.toMatchObject({ code: 'PAYMENT_PROVIDER_TIMEOUT' });
  });

  test('closes only the requested trade using the official signed close response', async () => {
    const request = jest.spyOn(urllib, 'request').mockResolvedValue(queryResponse({
      code: '10000', out_trade_no: 'order_001', trade_no: '20260910000001'
    }, { responseKey: 'alipay_trade_close_response' }));
    expect(await createAlipayProvider(config).closeOrder('order_001')).toMatchObject({
      code: '10000', outTradeNo: 'order_001', tradeNo: '20260910000001'
    });
    const [url, options] = request.mock.calls[0];
    expect(new URL(url).origin).toBe('https://openapi-sandbox.dl.alipaydev.com');
    expect(new URL(url).searchParams.get('method')).toBe('alipay.trade.close');
    expect(JSON.parse(options.data.biz_content)).toEqual({ out_trade_no: 'order_001' });
  });

  test.each([{ unsigned: true }, { tamper: true }])('rejects unverified closure: %j', async (mode) => {
    jest.spyOn(urllib, 'request').mockResolvedValue(queryResponse({
      code: '10000', out_trade_no: 'order_001', trade_no: '20260910000001'
    }, { ...mode, responseKey: 'alipay_trade_close_response' }));
    await expect(createAlipayProvider(config).closeOrder('order_001'))
      .rejects.toMatchObject({ code: 'PAYMENT_PROVIDER_ERROR' });
  });

  test.each(['ACQ.TRADE_HAS_SUCCESS', 'ACQ.TRADE_STATUS_ERROR', 'ACQ.TRADE_NOT_EXIST'])(
    'a signed close failure %s means requery, never closed', async (subCode) => {
      const request = jest.spyOn(urllib, 'request').mockResolvedValue(queryResponse({
        code: '40004', sub_code: subCode
      }, { responseKey: 'alipay_trade_close_response' }));
      await expect(createAlipayProvider(config).closeOrder('order_001'))
        .rejects.toMatchObject({ code: 'PAYMENT_CLOSE_RECHECK' });
      request.mockResolvedValue(queryResponse({ code: '40004', sub_code: subCode }, {
        responseKey: 'alipay_trade_close_response', unsigned: true
      }));
      await expect(createAlipayProvider(config).closeOrder('order_001'))
        .rejects.toMatchObject({ code: 'PAYMENT_PROVIDER_ERROR' });
    }
  );

  test('does not accept signed closure for another order or without a trade ID', async () => {
    const request = jest.spyOn(urllib, 'request');
    for (const body of [
      { code: '10000', out_trade_no: 'other_order', trade_no: '20260910000001' },
      { code: '10000', out_trade_no: 'order_001' }
    ]) {
      request.mockResolvedValue(queryResponse(body, { responseKey: 'alipay_trade_close_response' }));
      await expect(createAlipayProvider(config).closeOrder('order_001'))
        .rejects.toMatchObject({ code: 'PAYMENT_PROVIDER_ERROR' });
    }
  });

  test('close has a deadline and validates configuration and order number before network access', async () => {
    const sdk = { exec: jest.fn(() => new Promise(() => {})) };
    await expect(createAlipayProvider({ ...config, enabled: false }, { sdk }).closeOrder('order_001'))
      .rejects.toMatchObject({ code: 'PAYMENT_NOT_CONFIGURED' });
    await expect(createAlipayProvider(config, { sdk }).closeOrder('bad/order'))
      .rejects.toMatchObject({ code: 'PAYMENT_INVALID_ORDER' });
    expect(sdk.exec).not.toHaveBeenCalled();
    await expect(createAlipayProvider({ ...config, timeoutMs: 10 }, { sdk }).closeOrder('order_001'))
      .rejects.toMatchObject({ code: 'PAYMENT_PROVIDER_TIMEOUT' });
  });
});
