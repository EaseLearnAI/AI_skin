const { randomBytes } = require('crypto');
const PaymentOrder = require('../models/paymentOrder.model');
const User = require('../models/user.model');
const { ApiError } = require('../middlewares/error');
const { moneyToFen } = require('../config/payment');

const mismatch = () => new ApiError(400, '支付信息与订单不一致', 'PAYMENT_MISMATCH');
const publicOrder = (order) => ({
  id: String(order._id), outTradeNo: order.outTradeNo, productId: order.productId,
  amountFen: order.amountFen, currency: order.currency, status: order.status,
  expiresAt: order.expiresAt, paidAt: order.paidAt, refundAmountFen: order.refundAmountFen,
  provider: order.provider, environment: order.environment
});

// Alipay's legacy gateway timestamps are China Standard Time, independent of the server TZ.
const paymentDate = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(value)) throw mismatch();
  const date = new Date(`${value.replace(' ', 'T')}+08:00`);
  if (!Number.isFinite(date.getTime()) || date.getTime() > Date.now() + 300000) throw mismatch();
  if (new Date(date.getTime() + 8 * 3600000).toISOString().slice(0, 19).replace('T', ' ') !== value) throw mismatch();
  return date;
};
const addMonths = (date, count) => {
  const result = new Date(date);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + count);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
};

const createPaymentService = ({ alipayProvider, products }) => {
  const scope = () => ({ provider: 'alipay', environment: alipayProvider.environment, appId: alipayProvider.appId });
  const requireConfigured = () => {
    if (!alipayProvider.configured) throw new ApiError(503, '支付宝收款尚未配置', 'PAYMENT_NOT_CONFIGURED');
  };
  const findOwned = async (owner, id) => {
    const order = await PaymentOrder.findOne({ _id: id, owner, ...scope() }).select('+tradeNo');
    if (!order) throw new ApiError(404, '订单不存在', 'PAYMENT_ORDER_NOT_FOUND');
    return order;
  };
  const expireAbsentOrder = async (order) => {
    // The APP signature already contains the absolute time_expire. A verified
    // query must also say the trade is absent; local time by itself is insufficient.
    // Atomic predicate prevents a concurrent paid notification being overwritten.
    const expired = await PaymentOrder.findOneAndUpdate({
      _id: order._id, status: 'pending', paidAt: null, expiresAt: { $lte: new Date() }
    }, { $set: { status: 'closed', closeReason: 'expired_not_found', lastVerifiedAt: new Date() } },
    { returnDocument: 'after' });
    return expired || await PaymentOrder.findById(order._id).select('+tradeNo');
  };
  const reconcile = async (order, evidence = null, allowClose = true) => {
    requireConfigured();
    let result;
    try { result = await alipayProvider.queryOrder(order.outTradeNo); }
    catch (error) {
      // A notification promises a real trade: absence is retryable, not acknowledged as success.
      if (!evidence && error.code === 'PAYMENT_ORDER_NOT_FOUND') {
        if (order.status === 'pending') {
          return order.expiresAt <= new Date() ? expireAbsentOrder(order) : order;
        }
        if (order.status === 'closed' && order.closeReason === 'expired_not_found') return order;
      }
      if (error.code === 'PAYMENT_ORDER_NOT_FOUND') throw new ApiError(503, '支付状态暂未同步，请稍后重试', 'PAYMENT_NOT_SYNCED');
      throw error;
    }
    if (result.code !== '10000' || result.outTradeNo !== order.outTradeNo ||
        moneyToFen(result.totalAmount) !== order.amountFen ||
        (result.sellerId && result.sellerId !== order.sellerId) ||
        (result.appId && result.appId !== order.appId)) throw mismatch();
    if (!['WAIT_BUYER_PAY', 'TRADE_SUCCESS', 'TRADE_FINISHED', 'TRADE_CLOSED'].includes(result.tradeStatus)) throw mismatch();
    if (typeof result.tradeNo !== 'string' || !/^\d{1,64}$/.test(result.tradeNo) ||
        (order.tradeNo && order.tradeNo !== result.tradeNo) ||
        (evidence && evidence.trade_no !== result.tradeNo)) throw mismatch();
    if (result.tradeStatus === 'WAIT_BUYER_PAY' && order.expiresAt <= new Date()) {
      if (!allowClose) throw new ApiError(503, '支付状态暂未同步，请稍后重试', 'PAYMENT_NOT_SYNCED');
      try {
        // Close acts atomically at Alipay: an order paid in the meantime cannot
        // be closed. Never synthesize a refund or issue a cancel/refund request.
        const closure = await alipayProvider.closeOrder(order.outTradeNo);
        if (closure.code !== '10000' || closure.outTradeNo !== order.outTradeNo ||
            closure.tradeNo !== result.tradeNo) throw mismatch();
        result = { ...result, tradeStatus: 'TRADE_CLOSED' };
      } catch (error) {
        if (error.code === 'PAYMENT_CLOSE_RECHECK') return reconcile(order, evidence, false);
        throw error;
      }
    }
    const paid = ['TRADE_SUCCESS', 'TRADE_FINISHED'].includes(result.tradeStatus);
    const closed = result.tradeStatus === 'TRADE_CLOSED';
    let refund = evidence?.refund_fee === undefined ? 0 : moneyToFen(evidence.refund_fee);
    if (refund > order.amountFen) throw mismatch();
    const dateValue = result.sendPayDate || evidence?.gmt_payment;
    const paidAt = paid ? paymentDate(dateValue) : (closed && dateValue ? paymentDate(dateValue) : null);
    // Every state change is one atomic document update. Refunds are monotonic; stale success
    // notifications and simultaneous refreshes cannot resurrect refunded or
    // provider-closed orders. Locally expired/absent orders may receive late proof.
    let updated;
    try {
      updated = await PaymentOrder.findOneAndUpdate({
        _id: order._id, tradeNo: { $in: [null, result.tradeNo] }
      }, [
        { $set: {
          tradeNo: { $literal: result.tradeNo },
          paidAt: { $ifNull: ['$paidAt', paidAt] },
          refundAmountFen: { $max: ['$refundAmountFen', refund] },
          lastVerifiedAt: new Date()
        } },
        { $set: {
          status: { $switch: { branches: [
            { case: { $or: [ { $eq: ['$status', 'refunded'] }, { $gte: ['$refundAmountFen', '$amountFen'] },
              { $and: [closed, { $ne: ['$paidAt', null] }] } ] }, then: 'refunded' },
            { case: { $or: [{ $and: [{ $eq: ['$status', 'closed'] },
              { $ne: ['$closeReason', 'expired_not_found'] }] }, closed] }, then: 'closed' },
            { case: paid, then: 'paid' }
          ], default: '$status' } }
        } },
        { $set: {
          refundAmountFen: { $cond: [{ $eq: ['$status', 'refunded'] }, '$amountFen', '$refundAmountFen'] },
          closeReason: { $cond: [closed, 'provider_closed',
            { $cond: [{ $eq: ['$status', 'paid'] }, null, { $ifNull: ['$closeReason', null] }] }] }
        } }
      ], { returnDocument: 'after', updatePipeline: true });
    } catch (error) {
      if (error.code === 11000) throw mismatch();
      throw error;
    }
    if (!updated) throw mismatch();
    return updated;
  };

  return {
    catalog: async () => ({ provider: 'alipay', environment: alipayProvider.environment,
      available: alipayProvider.configured, products: products.map((item) => ({ ...item, autoRenew: false })),
      channels: [{ provider: 'alipay', available: alipayProvider.configured }, { provider: 'apple', available: false, status: 'planned' }]
    }),
    async createOrder(owner, { productId, idempotencyKey }) {
      requireConfigured();
      const checkOwner = async (order) => {
        if (await User.exists({ _id: owner, accountStatus: 'active', active: true })) return;
        if (order) await PaymentOrder.updateOne({ _id: order._id }, { $set: { owner: null, idempotencyKey: 'deleted-account' } });
        throw new ApiError(401, '账户已失效，请重新登录', 'AUTH_INVALID_TOKEN');
      };
      await checkOwner();
      const product = products.find((item) => item.id === productId && item.amountFen > 0);
      if (!product) throw new ApiError(400, '商品不存在', 'PAYMENT_PRODUCT_NOT_FOUND');
      const filter = { owner, ...scope(), idempotencyKey };
      let order = await PaymentOrder.findOne(filter).select('+tradeNo');
      if (!order) {
        try {
          order = await PaymentOrder.create({ ...filter, sellerId: alipayProvider.sellerId,
            outTradeNo: `AS${randomBytes(20).toString('hex')}`,
            productId, subject: product.name, amountFen: product.amountFen,
            currency: product.currency, durationMonths: product.durationMonths,
            expiresAt: new Date(Date.now() + 30 * 60000) });
        } catch (error) {
          if (error.code !== 11000) throw error;
          order = await PaymentOrder.findOne(filter).select('+tradeNo');
          if (!order) throw error;
        }
      }
      if (order.productId !== productId) throw new ApiError(409, '同一请求编号不能购买不同商品', 'PAYMENT_IDEMPOTENCY_CONFLICT');
      await checkOwner(order);
      if (order.status === 'pending' && order.expiresAt <= new Date()) order = await reconcile(order);
      let payment = null;
      if (order.status === 'pending' && order.expiresAt > new Date()) {
        payment = await alipayProvider.createAppPayment({ outTradeNo: order.outTradeNo,
          totalAmount: (order.amountFen / 100).toFixed(2), subject: order.subject, expiresAt: order.expiresAt });
      }
      await checkOwner(order);
      return { order: publicOrder(order), payment };
    },
    async getOrder(owner, id) { return { order: publicOrder(await findOwned(owner, id)) }; },
    async refreshOrder(owner, id) { return { order: publicOrder(await reconcile(await findOwned(owner, id))) }; },
    async handleNotification(params) {
      requireConfigured();
      if (!(await alipayProvider.verifyNotification(params))) throw new ApiError(400, '支付通知签名无效', 'PAYMENT_INVALID_SIGNATURE');
      if (params.app_id !== alipayProvider.appId || params.seller_id !== alipayProvider.sellerId) throw mismatch();
      const order = await PaymentOrder.findOne({ outTradeNo: params.out_trade_no, ...scope() }).select('+tradeNo');
      if (!order) throw new ApiError(404, '订单不存在', 'PAYMENT_ORDER_NOT_FOUND');
      if (moneyToFen(params.total_amount) !== order.amountFen ||
          !['WAIT_BUYER_PAY', 'TRADE_SUCCESS', 'TRADE_FINISHED', 'TRADE_CLOSED'].includes(params.trade_status)) throw mismatch();
      await reconcile(order, params);
    },
    async membership(owner) {
      // The verified order ledger is the source of truth, avoiding a partially written second
      // membership record and duplicate additions on standalone MongoDB installations.
      const readOrders = () => PaymentOrder.find({ owner, ...scope(), status: 'paid', paidAt: { $ne: null } })
        .select('+tradeNo').sort({ paidAt: 1, _id: 1 });
      const computeEnd = (orders) => orders.reduce((end, order) => order.refundAmountFen >= order.amountFen ? end :
        addMonths(end && end > order.paidAt ? end : order.paidAt, order.durationMonths), null);
      let orders = await readOrders();
      let end = computeEnd(orders);
      if (end && end > new Date()) {
        const stale = orders.filter((order) => !order.lastVerifiedAt || order.lastVerifiedAt.getTime() < Date.now() - 5 * 60000);
        for (const order of stale) await reconcile(order);
        if (stale.length) { orders = await readOrders(); end = computeEnd(orders); }
      }
      const active = end && end > new Date();
      return { tier: active ? 'member' : 'free', validUntil: end, provider: active ? 'alipay' : null,
        environment: alipayProvider.environment, autoRenew: false };
    }
  };
};

module.exports = { createPaymentService, addMonths };
