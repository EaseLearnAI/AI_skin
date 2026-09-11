const createPaymentController = (service) => ({
  catalog: async (req, res) => res.json({ success: true, data: await service.catalog() }),
  createOrder: async (req, res) => res.status(201).json({ success: true, data: await service.createOrder(req.user._id, req.body) }),
  getOrder: async (req, res) => res.json({ success: true, data: await service.getOrder(req.user._id, req.params.id) }),
  refreshOrder: async (req, res) => res.json({ success: true, data: await service.refreshOrder(req.user._id, req.params.id) }),
  membership: async (req, res) => res.json({ success: true, data: await service.membership(req.user._id) }),
  notify: async (req, res) => {
    await service.handleNotification(req.body);
    res.status(200).type('text/plain').send('success');
  }
});
module.exports = { createPaymentController };
