const { createPlanService } = require('../../src/services/plan.service');
const User = require('../../src/models/user.model');
const Product = require('../../src/models/product.model');
const SkinAnalysis = require('../../src/models/skinAnalysis.model');
const Plan = require('../../src/models/plan.model');

describe('plan generation preserves missing demographics', () => {
  afterEach(() => jest.restoreAllMocks());

  const run = async (user, input = {}) => {
    jest.spyOn(User, 'findById').mockReturnValue(Object.assign(Promise.resolve(user), {
      select: () => Promise.resolve({ ...user, activePlanId: null })
    }));
    jest.spyOn(Product, 'find').mockResolvedValue([{ name: '产品', ingredients: ['水'] }]);
    jest.spyOn(SkinAnalysis, 'findOne').mockReturnValue({ sort: () => Promise.resolve(null) });
    jest.spyOn(Plan, 'create').mockImplementation(async value => value);
    const generatePlan = jest.fn().mockResolvedValue({ name: '护理', morning: [], evening: [], recommendations: [] });
    const saved = await createPlanService({ aiProvider: { generatePlan } }).generate('owner', input);
    return { saved, sent: generatePlan.mock.calls[0][0] };
  };

  test('does not send or persist invented age or gender for an incomplete profile', async () => {
    const { saved, sent } = await run({});
    expect(sent.user.age).toBeUndefined();
    expect(sent.user.gender).toBeUndefined();
    expect(saved.userAge).toBeUndefined();
    expect(saved.userGender).toBeUndefined();
    expect(saved.menstrualCycleInfo).toBeUndefined();
  });

  test('keeps explicitly supplied age and known profile gender', async () => {
    const { saved, sent } = await run({ age: 34, gender: 'male' }, { age: 29, userAge: 31 });
    expect(sent.user).toMatchObject({ age: 31, gender: 'male' });
    expect(saved).toMatchObject({ userAge: 31, userGender: 'male' });
  });
});
