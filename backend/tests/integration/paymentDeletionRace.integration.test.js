const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const User = require('../../src/models/user.model');
const PaymentOrder = require('../../src/models/paymentOrder.model');
const { createPaymentService } = require('../../src/services/payment.service');
const { createAuthService } = require('../../src/services/auth.service');
const { createAccountDeletionService } = require('../../src/services/accountDeletion.service');

// Real temporary MongoDB and actual services; only the scheduling boundary and
// Alipay provider are substituted. This does not contact or charge Alipay.
describe('Payment creation racing with account deletion', () => {
  let mongo;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    await PaymentOrder.init();
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await mongoose.disconnect();
    if (mongo) await mongo.stop();
  });

  test('deletion finishing while a purchase lookup is pending cannot return a payable order', async () => {
    const user = await User.create({
      name: 'Payment deletion fixture', phone: '13900000779',
      password: 'fixture-password-123', gender: 'female'
    });
    const provider = {
      configured: true, environment: 'sandbox', appId: 'review-app', sellerId: 'review-seller',
      createAppPayment: jest.fn(() => ({ orderString: 'fixture-payable-order' }))
    };
    const paymentService = createPaymentService({ alipayProvider: provider, products: [
      { id: 'member_month', name: '会员', amountFen: 1200, currency: 'CNY', durationMonths: 1 }
    ] });
    const authService = createAuthService({
      jwtSecret: 'payment-deletion-fixture-secret-with-32-characters', jwtExpiresIn: '1h',
      accountDeletionService: createAccountDeletionService({ storageProvider: { deleteObject: async () => undefined } })
    });

    let releaseLookup;
    let reachLookup;
    const lookupReached = new Promise((resolve) => { reachLookup = resolve; });
    const originalFindOne = PaymentOrder.findOne;
    const lookup = jest.spyOn(PaymentOrder, 'findOne').mockImplementation(function (...args) {
      if (args[0].idempotencyKey === 'deletion-race-purchase') {
        reachLookup();
        return new Promise((resolve) => { releaseLookup = () => resolve(null); });
      }
      return originalFindOne.apply(this, args);
    });

    const pending = paymentService.createOrder(user._id, {
      productId: 'member_month', idempotencyKey: 'deletion-race-purchase'
    }).then((result) => ({ result }), (error) => ({ error }));
    try {
      // createOrder has already accepted the active owner. Complete the real
      // deletion and its order cleanup before permitting the insert to resume.
      await lookupReached;
      await authService.deleteAccount(user._id);
      expect(await User.findById(user._id)).toBeNull();
      releaseLookup();
      const outcome = await pending;
      expect(outcome.error).toMatchObject({ statusCode: 401, code: 'AUTH_INVALID_TOKEN' });
      expect(outcome.result).toBeUndefined();
      expect(provider.createAppPayment).not.toHaveBeenCalled();
      const orders = await PaymentOrder.find({}).select('+idempotencyKey').lean();
      expect(orders).toHaveLength(1);
      expect(orders[0].owner).toBeNull();
      expect(orders[0].idempotencyKey).toBe('deleted-account');
      expect(orders[0].status).toBe('pending');
    } finally {
      releaseLookup?.();
      await pending;
      lookup.mockRestore();
    }
  });
});
