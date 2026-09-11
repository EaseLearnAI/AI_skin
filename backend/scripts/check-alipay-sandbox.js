#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { randomBytes } = require('crypto');
const dotenv = require('dotenv');

const { loadPaymentConfig } = require('../src/config/payment');
const { createAlipayProvider } = require('../src/providers/payment/alipayProvider');

const ENV_FIELDS = Object.freeze([
  'ALIPAY_ENABLED', 'ALIPAY_ENVIRONMENT', 'ALIPAY_APP_ID', 'ALIPAY_SELLER_ID',
  'ALIPAY_PRIVATE_KEY', 'ALIPAY_PRIVATE_KEY_FILE', 'ALIPAY_PUBLIC_KEY',
  'ALIPAY_PUBLIC_KEY_FILE', 'ALIPAY_NOTIFY_URL'
]);
const SAFE_ERROR_CODES = new Set([
  'PAYMENT_NOT_CONFIGURED', 'PAYMENT_PROVIDER_ERROR', 'PAYMENT_PROVIDER_TIMEOUT',
  'PAYMENT_INVALID_ORDER'
]);
const SAFE_STATUSES = new Set(['WAIT_BUYER_PAY', 'TRADE_SUCCESS', 'TRADE_FINISHED', 'TRADE_CLOSED']);

const output = (value, exitCode) => {
  // Intentionally never print Error.message, key material, request/response
  // payloads, merchant identifiers, buyer details, order IDs, or input paths.
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
  process.exitCode = exitCode;
};

const run = async () => {
  if (process.execArgv.some((arg) => /^--env-file(?:-if-exists)?(?:=|$)/.test(arg))) {
    output({ success: false, code: 'PAYMENT_PROBE_INVALID_INVOCATION', gatewayVerified: false, paymentVerified: false }, 2);
    return;
  }
  const args = process.argv.slice(2);
  let envFile = path.resolve(__dirname, '../.env.alipay.sandbox');
  let transaction;
  let seenEnvFile = false;
  let seenTransaction = false;
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    const value = args[index + 1];
    if (!value || value.startsWith('--') ||
        !['--env-file', '--transaction'].includes(flag) ||
        (flag === '--env-file' && seenEnvFile) || (flag === '--transaction' && seenTransaction)) {
      output({ success: false, code: 'PAYMENT_PROBE_INVALID_ARGUMENTS', gatewayVerified: false, paymentVerified: false }, 2);
      return;
    }
    if (flag === '--env-file') {
      envFile = path.resolve(value);
      seenEnvFile = true;
    } else {
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(value)) {
        output({ success: false, code: 'PAYMENT_PROBE_INVALID_ARGUMENTS', gatewayVerified: false, paymentVerified: false }, 2);
        return;
      }
      transaction = value;
      seenTransaction = true;
    }
    index += 1;
  }

  // Parse only this dedicated file. Do not call dotenv.config(), merge
  // process.env, or silently fall back to the project's existing .env.
  let env;
  try {
    env = dotenv.parse(fs.readFileSync(envFile));
  } catch (error) {
    output({
      success: false,
      code: error.code === 'ENOENT' ? 'PAYMENT_PROBE_ENV_FILE_MISSING' : 'PAYMENT_PROBE_ENV_FILE_UNREADABLE',
      environment: 'sandbox', envFileReadable: false,
      fieldPresence: Object.fromEntries(ENV_FIELDS.map((field) => [field, false])),
      gatewayVerified: false, paymentVerified: false
    }, 2);
    return;
  }
  const fieldPresence = Object.fromEntries(ENV_FIELDS.map((field) => [field, Boolean(env[field]?.trim())]));
  const checks = {
    envFileReadable: true, fieldPresence,
    enabled: env.ALIPAY_ENABLED === 'true',
    sandboxOnly: env.ALIPAY_ENVIRONMENT === 'sandbox',
    privateKeySourcePresent: fieldPresence.ALIPAY_PRIVATE_KEY || fieldPresence.ALIPAY_PRIVATE_KEY_FILE,
    publicKeySourcePresent: fieldPresence.ALIPAY_PUBLIC_KEY || fieldPresence.ALIPAY_PUBLIC_KEY_FILE
  };
  if (!checks.sandboxOnly) {
    output({
      success: false, code: 'PAYMENT_PROBE_SANDBOX_ONLY',
      environment: env.ALIPAY_ENVIRONMENT === 'production' ? 'production' : 'invalid',
      checks, gatewayVerified: false, paymentVerified: false
    }, 2);
    return;
  }
  if (!checks.enabled || !fieldPresence.ALIPAY_APP_ID || !fieldPresence.ALIPAY_SELLER_ID ||
      !checks.privateKeySourcePresent || !checks.publicKeySourcePresent) {
    output({
      success: false, code: 'PAYMENT_PROBE_CONFIGURATION_MISSING', environment: 'sandbox',
      checks, gatewayVerified: false, paymentVerified: false
    }, 2);
    return;
  }

  // Relative key-file references are relative to the selected env file,
  // independent of the shell's working directory.
  for (const field of ['ALIPAY_PRIVATE_KEY_FILE', 'ALIPAY_PUBLIC_KEY_FILE']) {
    if (env[field]) env[field] = path.resolve(path.dirname(envFile), env[field]);
  }
  let provider;
  try {
    const config = loadPaymentConfig(env);
    provider = createAlipayProvider(config.alipay);
  } catch {
    output({
      success: false, code: 'PAYMENT_PROBE_CONFIGURATION_INVALID', environment: 'sandbox',
      checks, gatewayVerified: false, paymentVerified: false
    }, 2);
    return;
  }
  if (provider.environment !== 'sandbox' || provider.credentialsConfigured !== true) {
    output({
      success: false, code: 'PAYMENT_PROBE_CONFIGURATION_INVALID', environment: 'sandbox',
      checks: { ...checks, credentialsConfigured: provider.credentialsConfigured === true },
      gatewayVerified: false, paymentVerified: false
    }, 2);
    return;
  }
  const shared = {
    environment: 'sandbox',
    checks: { ...checks, credentialsConfigured: true, paymentCallbackConfigured: provider.configured === true },
    transactionProvided: Boolean(transaction), paymentVerified: false
  };
  const outTradeNo = transaction || `ASPROBE${randomBytes(20).toString('hex')}`;
  try {
    // This is the only external operation in the script. No createAppPayment,
    // purchase, refund, notification mutation, or application DB is involved.
    const result = await provider.queryOrder(outTradeNo);
    const tradeStatus = SAFE_STATUSES.has(result.tradeStatus) ? result.tradeStatus : 'UNKNOWN';
    output({
      success: true, code: 'PAYMENT_PROBE_GATEWAY_VERIFIED', ...shared,
      gatewayVerified: true, orderFound: true, tradeStatus
    }, 0);
  } catch (error) {
    if (error.code === 'PAYMENT_ORDER_NOT_FOUND') {
      // The provider verifies the signed Alipay business-error response before
      // mapping ACQ.TRADE_NOT_EXIST to this code. It is a successful gateway
      // probe, and explicitly not a successful purchase.
      output({
        success: true, code: 'PAYMENT_PROBE_GATEWAY_VERIFIED', ...shared,
        gatewayVerified: true, orderFound: false
      }, 0);
      return;
    }
    output({
      success: false,
      code: SAFE_ERROR_CODES.has(error.code) ? error.code : 'PAYMENT_PROBE_FAILED',
      ...shared, gatewayVerified: false
    }, 1);
  }
};

run().catch(() => output({
  success: false, code: 'PAYMENT_PROBE_FAILED', gatewayVerified: false, paymentVerified: false
}, 1));
