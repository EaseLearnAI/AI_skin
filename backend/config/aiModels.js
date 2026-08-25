require('dotenv').config();

const TEXT_MODEL = process.env.AI_TEXT_MODEL || 'qwen3.7-flash';
const VISION_MODEL = process.env.AI_VISION_MODEL || 'qwen3-vl-plus';
const OCR_MODEL = process.env.AI_OCR_MODEL || 'qwen-vl-ocr-latest';

module.exports = {
  TEXT_MODEL,
  VISION_MODEL,
  OCR_MODEL
};
