const { AlipaySdk } = require('alipay-sdk');

const { ApiError } = require('../../middlewares/error');

const GATEWAYS = Object.freeze({
  sandbox: 'https://openapi-sandbox.dl.alipaydev.com/gateway.do',
  production: 'https://openapi.alipay.com/gateway.do'
});
const ORDER_NUMBER = /^[A-Za-z0-9_-]{1,64}$/;
const AMOUNT = /^(?:0|[1-9]\d{0,8})(?:\.\d{1,2})?$/;

const invalidOrder = () => new ApiError(400, '支付订单参数无效', 'PAYMENT_INVALID_ORDER');
const unavailable = () => new ApiError(502, '支付宝服务暂时不可用，请稍后重试', 'PAYMENT_PROVIDER_ERROR');
const timedOut = () => new ApiError(504, '支付宝查询超时，请稍后重试', 'PAYMENT_PROVIDER_TIMEOUT');

const isTimeout = (error) => {
  // SDK wraps urllib errors in AlipayRequestError.cause. Never expose its raw
  // message, responseDataRaw, signed URL, or buyer information to callers.
  let current = error;
  for (let depth = 0; current && depth < 4; depth += 1, current = current.cause) {
    if (/TIMEOUT|TIMEDOUT/i.test(String(current.code || '')) || /timeout/i.test(String(current.name || ''))) {
      return true;
    }
  }
  return false;
};

const withDeadline = async (operation, timeoutMs) => {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise((resolve, reject) => { timer = setTimeout(() => reject(timedOut()), timeoutMs); })
    ]);
  } finally {
    clearTimeout(timer);
  }
};

const isValidAmount = (value) => {
  if (typeof value !== 'string' || !AMOUNT.test(value)) return false;
  const [yuan, fraction = ''] = value.split('.');
  const cents = Number(yuan) * 100 + Number(fraction.padEnd(2, '0'));
  return cents >= 1 && cents <= 10000000000;
};

const chinaDateTime = (date) => new Date(date.getTime() + 8 * 60 * 60 * 1000)
  .toISOString().slice(0, 19).replace('T', ' ');

const createAlipayProvider = (config = {}, { sdk } = {}) => {
  const environment = config.environment || 'sandbox';
  const appId = config.appId || '';
  const sellerId = config.sellerId || '';
  const keyType = config.keyType || 'PKCS8';
  const timeoutMs = Number.isInteger(config.timeoutMs) && config.timeoutMs > 0 && config.timeoutMs <= 60000
    ? config.timeoutMs : 10000;
  let notifyUrlValid = false;
  try {
    const url = new URL(config.notifyUrl);
    notifyUrlValid = url.protocol === 'https:' && !url.username && !url.password && !url.hash;
  } catch { /* Missing or invalid callback URL leaves the provider disabled. */ }

  // Requiring the Alipay public key is essential: SDK v2 exec otherwise silently
  // skips response verification even with validateSign:true.
  const credentialsConfigured = Boolean(config.enabled && Object.hasOwn(GATEWAYS, environment) &&
    appId && sellerId && config.privateKey && config.alipayPublicKey &&
    ['PKCS8', 'PKCS1'].includes(keyType));
  const configured = credentialsConfigured && notifyUrlValid;
  let client = sdk;

  const assertConfigured = (requireCallback = false) => {
    if (!credentialsConfigured || (requireCallback && !configured)) {
      throw new ApiError(503, '支付宝服务端支付尚未配置', 'PAYMENT_NOT_CONFIGURED');
    }
  };

  const getClient = () => {
    assertConfigured();
    if (!client) {
      try {
        client = new AlipaySdk({
          appId,
          privateKey: config.privateKey,
          alipayPublicKey: config.alipayPublicKey,
          keyType,
          gateway: GATEWAYS[environment],
          endpoint: new URL(GATEWAYS[environment]).origin,
          timeout: timeoutMs,
          signType: 'RSA2',
          charset: 'utf-8',
          camelcase: true
        });
      } catch {
        throw new ApiError(503, '支付宝服务端支付配置无效', 'PAYMENT_NOT_CONFIGURED');
      }
    }
    return client;
  };

  return {
    configured,
    credentialsConfigured,
    environment,
    appId,
    sellerId,

    createAppPayment(order = {}) {
      assertConfigured(true);
      const expiresAt = order.expiresAt instanceof Date ? order.expiresAt : new Date(order.expiresAt);
      if (!ORDER_NUMBER.test(order.outTradeNo || '') || !isValidAmount(order.totalAmount) ||
          typeof order.subject !== 'string' || !order.subject.trim() || order.subject.length > 256 ||
          /[\u0000-\u001f\u007f/=&]/.test(order.subject) ||
          !Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
        throw invalidOrder();
      }
      try {
        const orderString = getClient().sdkExecute('alipay.trade.app.pay', {
          notifyUrl: config.notifyUrl,
          bizContent: {
            outTradeNo: order.outTradeNo,
            subject: order.subject,
            totalAmount: order.totalAmount,
            productCode: 'QUICK_MSECURITY_PAY',
            timeExpire: chinaDateTime(expiresAt)
          }
        });
        if (typeof orderString !== 'string' || !orderString) throw unavailable();
        return { orderString };
      } catch (error) {
        if (error instanceof ApiError) throw error;
        throw unavailable();
      }
    },

    verifyNotification(params) {
      assertConfigured();
      if (!params || typeof params !== 'object' || Array.isArray(params) ||
          !Object.entries(params).every(([key, value]) =>
            key && !['__proto__', 'prototype', 'constructor'].includes(key) && typeof value === 'string') ||
          params.sign_type !== 'RSA2' || !params.sign ||
          params.app_id !== appId || params.seller_id !== sellerId) {
        return false;
      }
      try {
        // Express has already form-decoded the values. V2 prevents a second
        // decode from changing literal % / + characters in the signed content.
        return getClient().checkNotifySignV2(params) === true;
      } catch (error) {
        if (error instanceof ApiError) throw error;
        return false;
      }
    },

    async queryOrder(outTradeNo) {
      assertConfigured();
      if (typeof outTradeNo !== 'string' || !ORDER_NUMBER.test(outTradeNo)) throw invalidOrder();
      let result;
      try {
        // This is the v2 API documented for AI mobile APP payments. Explicit
        // response verification applies to both successful and business-error
        // bodies, including ACQ.TRADE_NOT_EXIST; unsigned bodies fail closed.
        result = await withDeadline(() => getClient().exec('alipay.trade.query', {
          bizContent: { outTradeNo }
        }, { validateSign: true }), timeoutMs);
      } catch (error) {
        if (error instanceof ApiError) throw error;
        if (isTimeout(error)) throw timedOut();
        throw unavailable();
      }
      if (result?.code === '40004' && result.subCode === 'ACQ.TRADE_NOT_EXIST') {
        throw new ApiError(404, '支付宝尚未创建该交易', 'PAYMENT_ORDER_NOT_FOUND');
      }
      if (result?.code !== '10000' || result.outTradeNo !== outTradeNo) throw unavailable();
      // Do not invent refundFee=0 when omitted. Query does not promise that
      // field; signed refund notifications remain necessary for partial refunds.
      return result;
    },

    async closeOrder(outTradeNo) {
      assertConfigured();
      if (typeof outTradeNo !== 'string' || !ORDER_NUMBER.test(outTradeNo)) throw invalidOrder();
      let result;
      try {
        result = await withDeadline(() => getClient().exec('alipay.trade.close', {
          bizContent: { outTradeNo }
        }, { validateSign: true }), timeoutMs);
      } catch (error) {
        if (error instanceof ApiError) throw error;
        if (isTimeout(error)) throw timedOut();
        throw unavailable();
      }
      // These signed business failures require another query; none prove closure.
      if (result?.code === '40004' && ['ACQ.TRADE_NOT_EXIST', 'ACQ.TRADE_STATUS_ERROR',
        'ACQ.TRADE_HAS_SUCCESS'].includes(result.subCode)) {
        throw new ApiError(409, '支付状态已变化，请重新查询', 'PAYMENT_CLOSE_RECHECK');
      }
      if (result?.code !== '10000' || result.outTradeNo !== outTradeNo ||
          typeof result.tradeNo !== 'string' || !/^\d{1,64}$/.test(result.tradeNo)) throw unavailable();
      return result;
    }
  };
};

module.exports = { createAlipayProvider };
