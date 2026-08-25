// Compatibility export. New code must import src/config/config and call loadConfig explicitly.
const { loadConfig } = require('../src/config/config');

module.exports = loadConfig();
