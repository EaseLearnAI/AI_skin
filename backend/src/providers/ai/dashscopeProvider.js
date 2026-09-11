const axios = require('axios');
const { randomUUID } = require('crypto');

const { ApiError } = require('../../middlewares/error');
const { analysisTasks } = require('./tasks');

const silentLogger = { info: () => undefined, error: () => undefined };

const createDashscopeProvider = ({ config, httpClient = axios, logger = silentLogger }) => {
  const call = async ({ model, messages, schema, task, promptVersion, schemaVersion, requestId,
    requestOptions = {}, normalize = (value) => value }) => {
    const startedAt = Date.now();
    const trace = { provider: 'dashscope', model, task, promptVersion, schemaVersion,
      callId: randomUUID(), ...(requestId ? { requestId } : {}),
      ...(requestOptions.enable_thinking !== undefined ? { thinkingEnabled: requestOptions.enable_thinking } : {}),
      ...(requestOptions.thinking_budget !== undefined ? { thinkingBudget: requestOptions.thinking_budget } : {}) };
    const captureResponse = (response) => {
      const headers = response?.headers;
      const id = headers?.['x-request-id'] || headers?.['x-dashscope-request-id'] || response?.data?.request_id;
      if (typeof id === 'string') trace.upstreamRequestId = id.slice(0, 200);
      if (typeof response?.data?.id === 'string') trace.responseId = response.data.id.slice(0, 200);
      if (typeof response?.data?.model === 'string') trace.upstreamModel = response.data.model.slice(0, 200);
      const counts = Object.fromEntries([
        ['promptTokens', response?.data?.usage?.prompt_tokens],
        ['completionTokens', response?.data?.usage?.completion_tokens],
        ['reasoningTokens', response?.data?.usage?.completion_tokens_details?.reasoning_tokens],
        ['totalTokens', response?.data?.usage?.total_tokens]
      ].filter(([, value]) => Number.isInteger(value) && value >= 0));
      if (Object.keys(counts).length) trace.usage = counts;
    };
    let status = 'failed';
    let errorCode;
    try {
      let response;
      try {
        response = await httpClient.post(`${config.baseURL}/chat/completions`, {
          model,
          messages,
          ...requestOptions,
          response_format: { type: 'json_object' }
        }, {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiKey}`
          },
          timeout: config.timeoutMs
        });
      } catch (error) {
        captureResponse(error.response);
        throw new ApiError(error.code === 'ECONNABORTED' ? 504 : 502, 'AI 服务暂时不可用', 'AI_UPSTREAM_ERROR');
      }
      captureResponse(response);
      const content = response.data?.choices?.[0]?.message?.content;
      let parsed;
      try {
        parsed = JSON.parse(content);
      } catch (error) {
        throw new ApiError(502, 'AI 返回结果格式不正确', 'AI_OUTPUT_INVALID');
      }
      const validated = schema.validate(normalize(parsed), { abortEarly: false, allowUnknown: false, stripUnknown: false });
      if (validated.error) {
        logger.error?.({
          event: 'ai_output_invalid',
          ...trace,
          validationErrors: validated.error.details.map((detail) => ({
            path: detail.path.join('.'),
            type: detail.type,
            ...(detail.type === 'any.only' && typeof detail.context?.value === 'string'
              ? { value: detail.context.value.slice(0, 80) }
              : {})
          }))
        });
        throw new ApiError(502, 'AI 返回结果字段不完整', 'AI_OUTPUT_INVALID');
      }
      status = 'succeeded';
      const processingTime = Date.now() - startedAt;
      const { task: taskName, ...analysisConfig } = trace;
      return { value: validated.value, rawContent: content, processingTime,
        analysisConfig: { ...analysisConfig, analysisDate: new Date(startedAt), processingTime } };
    } catch (error) {
      errorCode = error.code;
      throw error;
    } finally {
      logger.info({
        event: 'ai_call',
        ...trace,
        status,
        ...(errorCode ? { errorCode } : {}),
        durationMs: Date.now() - startedAt
      });
    }
  };

  // Every task uses the same transport, validation and tracing path. Business-specific
  // messages, normalizers and compatibility result shapes belong to the task catalog.
  return Object.fromEntries(Object.entries(analysisTasks).map(([method, definition]) => [
    method,
    async (input) => definition.present(await call({
      task: definition.task,
      model: config[definition.modelKey],
      requestOptions: definition.requestOptions?.(config),
      messages: definition.messages(input),
      schema: definition.schema,
      promptVersion: definition.promptVersion,
      schemaVersion: definition.schemaVersion,
      normalize: definition.normalize,
      requestId: input.requestId
    }))
  ]));
};

module.exports = { createDashscopeProvider };
