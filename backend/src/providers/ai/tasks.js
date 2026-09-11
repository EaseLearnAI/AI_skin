const { schemas } = require('./outputSchemas');
const {
  normalizeOcrOutput, normalizeIngredientOutput, normalizeConflictOutput,
  normalizePlanOutput, normalizeSkinOutput
} = require('./outputNormalizers');
const {
  productOcrPrompt, ingredientPrompt, conflictPrompt, planPrompt, skinPrompt, promptVersions
} = require('../../prompts');

const defineTask = (task, definition) => Object.freeze({
  task,
  schema: schemas[task],
  promptVersion: promptVersions[task],
  ...definition
});
const valueOnly = (result) => result.value;

// These are provider tasks, not database workflows. Services retain ownership,
// revision checks, persistence and image cleanup; this catalog has no I/O.
const analysisTasks = Object.freeze({
  extractProductInfo: defineTask('ocr', {
    modelKey: 'ocrModel',
    schemaVersion: 'ocr-v1',
    normalize: normalizeOcrOutput,
    messages: ({ imageUrl }) => [{
      role: 'user',
      content: [
        { type: 'text', text: productOcrPrompt() },
        { type: 'image_url', image_url: { url: imageUrl } }
      ]
    }],
    present: ({ value, rawContent, analysisConfig }) => ({
      productName: value.产品名称,
      ingredients: value.产品成分,
      rawContent,
      analysisConfig
    })
  }),
  analyzeIngredients: defineTask('ingredients', {
    modelKey: 'textModel',
    // Retain reasoning and the entire answer. Only the model family evaluated
    // on the saved product fixtures receives this provider-specific parameter.
    requestOptions: ({ textModel, ingredientThinkingBudget }) => (
      /^qwen3\.7-flash(?:-\d{4}-\d{2}-\d{2})?$/.test(textModel)
      && Number.isSafeInteger(ingredientThinkingBudget) && ingredientThinkingBudget > 0
        ? { enable_thinking: true, thinking_budget: ingredientThinkingBudget } : {}
    ),
    schemaVersion: 'ingredients-v2-concise-reading',
    normalize: normalizeIngredientOutput,
    messages: (input) => [{ role: 'user', content: ingredientPrompt(input) }],
    present: ({ value, rawContent, analysisConfig }) => ({ ...value, rawContent, analysisConfig })
  }),
  analyzeConflict: defineTask('conflict', {
    modelKey: 'textModel',
    schemaVersion: 'conflict-v2-product-report',
    normalize: normalizeConflictOutput,
    messages: (input) => [{ role: 'user', content: conflictPrompt(input) }],
    present: valueOnly
  }),
  generatePlan: defineTask('plan', {
    modelKey: 'textModel',
    schemaVersion: 'plan-v1',
    normalize: normalizePlanOutput,
    messages: (input) => [{ role: 'user', content: planPrompt(input) }],
    present: valueOnly
  }),
  analyzeSkin: defineTask('skin', {
    modelKey: 'visionModel',
    schemaVersion: 'skin-v2-other-issues',
    normalize: normalizeSkinOutput,
    messages: ({ imageUrl }) => [{
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: imageUrl } },
        { type: 'text', text: skinPrompt() }
      ]
    }],
    present: ({ value, rawContent, processingTime, analysisConfig }) => ({
      data: value,
      rawContent,
      processingTime,
      model: analysisConfig.model,
      promptVersion: analysisConfig.promptVersion,
      schemaVersion: analysisConfig.schemaVersion,
      analysisConfig
    })
  })
});

module.exports = { analysisTasks };
