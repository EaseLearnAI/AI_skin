const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');

const { requestId } = require('./middlewares/requestId');
const { notFound, errorHandler } = require('./middlewares/error');
const { createAccessLog } = require('./middlewares/accessLog');

const silentLogger = { info: () => undefined, error: () => undefined };

const createApp = ({ router, readinessCheck = async () => true, logger = silentLogger } = {}) => {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.locals.logger = logger;
  app.use(requestId);
  app.use(createAccessLog(logger));
  app.use(helmet());
  app.use(compression());
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  app.get('/health', (req, res) => {
    res.status(200).json({ success: true, status: 'ok' });
  });
  app.get('/ready', async (req, res, next) => {
    try {
      const ready = await readinessCheck();
      res.status(ready ? 200 : 503).json({
        success: ready,
        status: ready ? 'ready' : 'not_ready'
      });
    } catch (error) {
      next(error);
    }
  });
  app.get('/', (req, res) => {
    res.json({ message: 'Welcome to AI Skincare System API - 皮肤分析功能已启用' });
  });

  if (router) {
    app.use('/api', router);
  }

  app.use(notFound);
  app.use(errorHandler);
  return app;
};

module.exports = { createApp };
