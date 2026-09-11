const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadPaymentConfig, moneyToFen } = require('../../src/config/payment');
const { addMonths } = require('../../src/services/payment.service');

describe('payment configuration and calendar boundaries', () => {
  test('keeps payment disabled by default and sandbox prices cannot become implicit production prices', () => {
    expect(loadPaymentConfig({}).alipay.enabled).toBe(false);
    expect(() => loadPaymentConfig({ ALIPAY_ENABLED: 'true', ALIPAY_ENVIRONMENT: 'production' })).toThrow('MEMBERSHIP_MONTH_PRICE_FEN');
    const config = loadPaymentConfig({ ALIPAY_ENABLED: 'true', ALIPAY_ENVIRONMENT: 'production',
      MEMBERSHIP_MONTH_PRICE_FEN: '1500', MEMBERSHIP_YEAR_PRICE_FEN: '10000' });
    expect(config.products.map((item) => item.amountFen)).toEqual([1500, 10000]);
  });
  test.each(['0', '-1', '12.3', '1e3', '10000001'])('rejects invalid configured prices: %s', (price) => {
    expect(() => loadPaymentConfig({ ALIPAY_ENABLED: 'true', MEMBERSHIP_MONTH_PRICE_FEN: price })).toThrow('MEMBERSHIP_MONTH_PRICE_FEN');
  });
  test('does not allow an arbitrary gateway environment', () => {
    expect(() => loadPaymentConfig({ ALIPAY_ENVIRONMENT: 'local' })).toThrow('Invalid ALIPAY_ENVIRONMENT');
  });
  test('loads secret files without exposing filenames or content in read errors', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiskin-payment-config-'));
    try {
      const file = path.join(dir, 'fixture.pem');
      fs.writeFileSync(file, 'test-only-private-key-fixture\n', { mode: 0o600 });
      expect(loadPaymentConfig({ ALIPAY_PRIVATE_KEY_FILE: file }).alipay.privateKey).toBe('test-only-private-key-fixture');
      expect(() => loadPaymentConfig({ ALIPAY_PRIVATE_KEY_FILE: path.join(dir, 'nonexistent-sensitive-name') }))
        .toThrow('ALIPAY_PRIVATE_KEY_FILE could not be read');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
  test('uses exact integer fen and clamps month and leap-year boundaries', () => {
    expect(moneyToFen('0.01')).toBe(1);
    expect(moneyToFen('12.3')).toBe(1230);
    expect(() => moneyToFen('12.001')).toThrow();
    expect(() => moneyToFen(12)).toThrow();
    expect(addMonths(new Date('2026-01-31T12:00:00Z'), 1).toISOString()).toBe('2026-02-28T12:00:00.000Z');
    expect(addMonths(new Date('2024-02-29T12:00:00Z'), 12).toISOString()).toBe('2025-02-28T12:00:00.000Z');
  });
});
