const mongoose = require('mongoose');

// Shared provenance for each persisted AI result; missing legacy metadata stays absent.
const analysisConfigSchema = new mongoose.Schema({
  provider: String,
  model: { type: String, required: true },
  upstreamModel: String,
  promptVersion: String,
  schemaVersion: String,
  analysisDate: Date,
  processingTime: Number,
  thinkingEnabled: Boolean,
  thinkingBudget: Number,
  callId: String,
  requestId: String,
  upstreamRequestId: String,
  responseId: String,
  usage: {
    promptTokens: Number,
    completionTokens: Number,
    reasoningTokens: Number,
    totalTokens: Number
  }
}, { _id: false });

module.exports = { analysisConfigSchema };
