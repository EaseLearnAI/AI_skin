require('dotenv').config();

const { createRuntime, startFromCommandLine } = require('./src');

if (require.main === module) {
  startFromCommandLine().catch((error) => {
    console.error('Server failed to start:', error.message);
    process.exitCode = 1;
  });
} else {
  const runtime = createRuntime();
  runtime.app.start = runtime.start;
  runtime.app.stop = runtime.stop;
  runtime.app.close = runtime.stop;
  module.exports = runtime.app;
}
