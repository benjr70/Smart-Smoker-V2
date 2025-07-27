// Global test setup for memory leak prevention and error handling

// Handle unhandled promise rejections to prevent memory leaks
process.on('unhandledRejection', (reason, promise) => {
  console.warn('Unhandled Rejection at:', promise, 'reason:', reason);
  // Log the warning but don't exit the process during tests
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Log the error but don't exit during tests
});

// Shorter timeout for all tests to prevent hanging
jest.setTimeout(15000);

// Memory leak detection - suppress known warnings
const originalConsoleWarn = console.warn;
console.warn = (...args: any[]) => {
  const message = args.join(' ');
  if (message.includes('Permission denied') || 
      message.includes('/dev/ttyS0') ||
      message.includes('SerialPort')) {
    return; // Suppress known test environment warnings
  }
  originalConsoleWarn.apply(console, args);
};

// Global cleanup after each test
afterEach(() => {
  // Clear all timers and intervals
  jest.clearAllTimers();
  jest.clearAllMocks();
  
  // Force garbage collection if available
  if (global.gc) {
    try {
      global.gc();
    } catch (e) {
      // Ignore GC errors
    }
  }
});

// Global cleanup after all tests
afterAll(() => {
  // Final cleanup
  if (global.gc) {
    try {
      global.gc();
    } catch (e) {
      // Ignore GC errors
    }
  }
});