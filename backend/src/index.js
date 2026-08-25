const http = require('http');
const mongoose = require('mongoose');

const { loadConfig } = require('./config/config');
const { createLogger } = require('./config/logger');
const { createApp } = require('./app');
const { createApiRouter } = require('./routes');
const { createAuthService } = require('./services/auth.service');
const { createDomainServices } = require('./services');
const { createAccountDeletionService } = require('./services/accountDeletion.service');
const { createDashscopeProvider } = require('./providers/ai/dashscopeProvider');
const { createAppleTokenVerifier } = require('./providers/apple/appleTokenVerifier');
const { createAppleOAuthClient } = require('./providers/apple/appleOAuthClient');
const { createAliOssClient, createObjectStorageProvider } = require('./providers/storage/objectStorage');
const { createPasswordResetSender } = require('./providers/sms/passwordResetSender');

const createRuntime = ({
  env = process.env,
  mongooseClient = mongoose,
  httpServer,
  overrides = {}
} = {}) => {
  const config = loadConfig(env);
  const logger = overrides.logger || createLogger();
  const appleVerifier = overrides.appleVerifier || createAppleTokenVerifier(config.apple);
  const appleOAuthClient = overrides.appleOAuthClient || createAppleOAuthClient(config.apple);
  const storageProvider = overrides.storageProvider || createObjectStorageProvider({
    client: createAliOssClient(config.storage),
    productImagesPublic: config.storage.productImagesPublic,
    faceSignedUrlExpiresSeconds: config.storage.faceSignedUrlExpiresSeconds
  });
  const aiProvider = overrides.aiProvider || createDashscopeProvider({ config: config.ai, logger });
  const accountDeletionService = createAccountDeletionService({ storageProvider });
  const passwordResetSender = overrides.passwordResetSender || createPasswordResetSender(config.sms);
  const authService = createAuthService({
    jwtSecret: config.jwt.secret,
    jwtExpiresIn: config.jwt.expiresIn,
    appleVerifier,
    appleOAuthClient,
    passwordResetSender,
    onPasswordResetDeliveryError: (error) => logger.error({
      event: 'password_reset_delivery_failed',
      errorName: error.name,
      errorCode: error.code
    }),
    refreshTokenEncryptionKey: config.apple.refreshTokenEncryptionKey,
    accountDeletionService
  });
  const services = createDomainServices({ aiProvider, storageProvider });
  const app = createApp({
    router: createApiRouter({ authService, ...services }),
    readinessCheck: async () => mongooseClient.connection.readyState === 1,
    logger
  });
  const server = httpServer || http.createServer(app);
  let started = false;

  const start = async () => {
    if (started) return server;
    await mongooseClient.connect(config.mongoURI);
    try {
      await new Promise((resolve, reject) => {
        const onError = (error) => reject(error);
        if (typeof server.once === 'function') server.once('error', onError);
        server.listen(config.port, '127.0.0.1', () => {
          if (typeof server.off === 'function') server.off('error', onError);
          started = true;
          resolve();
        });
      });
    } catch (error) {
      if (mongooseClient.connection.readyState !== 0) await mongooseClient.disconnect();
      throw error;
    }
    return server;
  };

  const stop = async () => {
    if (started) {
      await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
      started = false;
    }
    if (mongooseClient.connection.readyState !== 0) await mongooseClient.disconnect();
  };

  return { app, config, server, start, stop };
};

const startFromCommandLine = async () => {
  const runtime = createRuntime();
  const shutdown = async () => {
    try {
      await runtime.stop();
      process.exit(0);
    } catch (error) {
      process.exit(1);
    }
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
  await runtime.start();
  return runtime;
};

module.exports = { createRuntime, startFromCommandLine };
