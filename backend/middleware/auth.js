// 这是一个兼容性文件，重新导出 authMiddleware.js 中的 protect 方法
// 用于支持使用 auth 中间件的路由

const { protect } = require('./authMiddleware');
 
// 导出 protect 方法作为默认中间件
module.exports = protect; 