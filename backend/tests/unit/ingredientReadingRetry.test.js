jest.mock('../../src/models/product.model', () => ({ findOne: jest.fn(), findOneAndUpdate: jest.fn() }));
const Product = require('../../src/models/product.model');
const { createProductService } = require('../../src/services/product.service');

beforeEach(() => {
  jest.resetAllMocks();
  Product.findOne.mockResolvedValue({ _id: 'p', createdBy: 'u', name: '面霜', ingredients: ['水'], __v: 2 });
  Product.findOneAndUpdate.mockResolvedValue({ ingredientAnalysis: { summary: '有效输出' }, description: '有效输出' });
});

test('retries invalid output once with guidance before saving', async () => {
  const analyzeIngredients = jest.fn()
    .mockRejectedValueOnce(Object.assign(new Error('Invalid output'), { code: 'AI_OUTPUT_INVALID' }))
    .mockResolvedValueOnce({ summary: '有效输出', rawContent: '{}', analysisConfig: { promptVersion: 'v4' } });
  const service = createProductService({ aiProvider: { analyzeIngredients } });
  await service.analyzeIngredients('u', 'p', 'r');
  expect(analyzeIngredients).toHaveBeenCalledTimes(2);
  expect(analyzeIngredients.mock.calls[1][0]).toMatchObject({ productName: '面霜', requestId: 'r', validationFeedback: expect.any(String) });
  expect(Product.findOneAndUpdate).toHaveBeenCalledTimes(1);
  expect(Product.findOneAndUpdate.mock.calls[0][0]).toMatchObject({ __v: 2 });
});

test.each(['AI_OUTPUT_INVALID', 'AI_UPSTREAM_ERROR'])('preserves saved report on continued failure: %s', async (code) => {
  const error = Object.assign(new Error('Failure'), { code });
  const analyzeIngredients = jest.fn().mockRejectedValue(error);
  const service = createProductService({ aiProvider: { analyzeIngredients } });
  await expect(service.analyzeIngredients('u', 'p')).rejects.toBe(error);
  expect(analyzeIngredients).toHaveBeenCalledTimes(code === 'AI_OUTPUT_INVALID' ? 2 : 1);
  expect(Product.findOneAndUpdate).not.toHaveBeenCalled();
});
