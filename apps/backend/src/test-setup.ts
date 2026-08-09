// Global test setup for proper memory management and mock cleanup

// Clean up all mocks after each test
afterEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  jest.resetAllMocks();
});

// Global timeout for tests to prevent memory issues
jest.setTimeout(10000);

// Increase memory limit if needed
if (global.gc) {
  afterEach(() => {
    // Re-checked at call time: `global.gc` is only present under --expose-gc,
    // and the guard above cannot narrow it inside a deferred callback.
    global.gc?.();
  });
}

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  // Uncomment the following lines to suppress console output during tests
  // log: jest.fn(),
  // warn: jest.fn(),
  // error: jest.fn(),
};
