// Contract fixture only; no clinical or model-quality claim.
const conflictReport = (products) => ({
  riskScore: 1,
  summary: '所选产品未提示明确冲突，需结合使用说明与实际耐受情况。',
  productPairs: products.flatMap((product, index) => products.slice(index + 1).map((other) => ({
    productIds: [product.id, other.id], status: 'compatible',
    explanation: '现有标签信息未提示明确的叠加冲突。'
  })))
});
module.exports = { conflictReport };
