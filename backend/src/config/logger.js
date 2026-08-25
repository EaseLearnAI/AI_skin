const write = (stream, record) => stream.write(`${JSON.stringify({
  timestamp: new Date().toISOString(),
  ...record
})}\n`);

const createLogger = ({ stdout = process.stdout, stderr = process.stderr } = {}) => ({
  info: (record) => write(stdout, { level: 'info', ...record }),
  error: (record) => write(stderr, { level: 'error', ...record })
});

module.exports = { createLogger };
