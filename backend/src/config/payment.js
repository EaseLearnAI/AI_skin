const { ApiError } = require('../middlewares/error');
const fs = require('node:fs');

const loadPaymentConfig = (env) => {
  const enabled = env.ALIPAY_ENABLED === 'true';
  const environment = env.ALIPAY_ENVIRONMENT || 'sandbox';
  if (!['sandbox', 'production'].includes(environment)) throw new Error('Invalid ALIPAY_ENVIRONMENT');
  const key = (name) => {
    if (env[name]) return env[name].replace(/\\n/g, '\n');
    if (!env[`${name}_FILE`]) return '';
    try {
      if (fs.statSync(env[`${name}_FILE`]).size > 65536) throw new Error();
      return fs.readFileSync(env[`${name}_FILE`], 'utf8').trim();
    } catch { throw new Error(`${name}_FILE could not be read`); }
  };
  const price = (name, fallback) => {
    const raw = env[name] || (environment === 'sandbox' ? String(fallback) : '');
    if (!/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > 10000000) {
      if (enabled) throw new Error(`${name} must be explicitly configured as positive integer fen`);
      return 0;
    }
    return Number(raw);
  };
  return Object.freeze({
    alipay: Object.freeze({
      enabled, environment,
      appId: env.ALIPAY_APP_ID || '', sellerId: env.ALIPAY_SELLER_ID || '',
      privateKey: key('ALIPAY_PRIVATE_KEY'),
      alipayPublicKey: key('ALIPAY_PUBLIC_KEY'),
      notifyUrl: env.ALIPAY_NOTIFY_URL || '', keyType: env.ALIPAY_KEY_TYPE || 'PKCS8',
      timeoutMs: 10000
    }),
    products: Object.freeze([
      Object.freeze({ id: 'member_month', name: '析肤会员 · 1个月', amountFen: price('MEMBERSHIP_MONTH_PRICE_FEN', 1200), currency: 'CNY', durationMonths: 1 }),
      Object.freeze({ id: 'member_year', name: '析肤会员 · 1年', amountFen: price('MEMBERSHIP_YEAR_PRICE_FEN', 8800), currency: 'CNY', durationMonths: 12 })
    ])
  });
};

const moneyToFen = (value) => {
  if (typeof value !== 'string' || !/^\d{1,8}(\.\d{1,2})?$/.test(value)) {
    throw new ApiError(400, '支付金额格式无效', 'PAYMENT_MISMATCH');
  }
  const [yuan, fraction = ''] = value.split('.');
  return Number(yuan) * 100 + Number(fraction.padEnd(2, '0'));
};

module.exports = { loadPaymentConfig, moneyToFen };
