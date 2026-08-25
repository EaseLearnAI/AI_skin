const { createRuntime } = require('../../src');

describe('server lifecycle', () => {
  const env = {
    NODE_ENV: 'test',
    PORT: '5001',
    MONGODB_URI: 'mongodb://test/aiskin',
    JWT_SECRET: 'runtime-test-secret-with-at-least-32-characters'
  };

  test('connects the database before listening and closes both resources', async () => {
    const events = [];
    const mongooseClient = {
      connection: { readyState: 0 },
      connect: jest.fn(async () => { events.push('connected'); mongooseClient.connection.readyState = 1; }),
      disconnect: jest.fn(async () => { events.push('disconnected'); })
    };
    const httpServer = {
      listen: jest.fn((port, host, callback) => { events.push(`listen:${host}:${port}`); callback(); }),
      close: jest.fn((callback) => { events.push('closed'); callback(); })
    };
    const runtime = createRuntime({ env, mongooseClient, httpServer });

    await runtime.start();
    await runtime.stop();

    expect(events).toEqual(['connected', 'listen:127.0.0.1:5001', 'closed', 'disconnected']);
  });

  test('never listens when the database connection fails', async () => {
    const mongooseClient = {
      connection: { readyState: 0 },
      connect: jest.fn(async () => { throw new Error('database unavailable'); }),
      disconnect: jest.fn()
    };
    const httpServer = { listen: jest.fn(), close: jest.fn() };
    const runtime = createRuntime({ env, mongooseClient, httpServer });

    await expect(runtime.start()).rejects.toThrow('database unavailable');
    expect(httpServer.listen).not.toHaveBeenCalled();
  });

  test('disconnects the database when the HTTP listener cannot start', async () => {
    let errorHandler;
    const mongooseClient = {
      connection: { readyState: 0 },
      connect: jest.fn(async () => { mongooseClient.connection.readyState = 1; }),
      disconnect: jest.fn(async () => { mongooseClient.connection.readyState = 0; })
    };
    const httpServer = {
      once: jest.fn((event, handler) => { if (event === 'error') errorHandler = handler; }),
      off: jest.fn(),
      listen: jest.fn(() => errorHandler(new Error('address already in use'))),
      close: jest.fn()
    };
    const runtime = createRuntime({ env, mongooseClient, httpServer });

    await expect(runtime.start()).rejects.toThrow('address already in use');
    expect(mongooseClient.disconnect).toHaveBeenCalledTimes(1);
  });
});
