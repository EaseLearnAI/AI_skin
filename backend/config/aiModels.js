// Compatibility export for older scripts. Runtime task mapping lives in src/config/config.
const { ai } = require('../src/config/config').loadConfig();

module.exports = {
  TEXT_MODEL: ai.textModel,
  VISION_MODEL: ai.visionModel,
  OCR_MODEL: ai.ocrModel
};
