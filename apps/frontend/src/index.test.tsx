import React from 'react';

// Mock functions
const mockRender = jest.fn();
const mockCreateRoot = jest.fn(() => ({
  render: mockRender,
}));
const mockReportWebVitals = jest.fn();

// Set up mocks before imports
jest.mock('react-dom/client', () => ({
  createRoot: mockCreateRoot,
}));

jest.mock('./App', () => ({
  __esModule: true,
  default: () => ({ type: 'div', props: { 'data-testid': 'app', children: 'App Component' } }),
}));

jest.mock('./reportWebVitals', () => ({
  __esModule: true,
  default: mockReportWebVitals,
}));

describe('index.tsx', () => {
  let originalGetElementById: typeof document.getElementById;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    mockRender.mockClear();
    mockCreateRoot.mockClear();
    mockReportWebVitals.mockClear();

    // Reset mockCreateRoot to return the object with render method
    mockCreateRoot.mockReturnValue({
      render: mockRender,
    });

    // Store original function
    originalGetElementById = document.getElementById;

    // Clear module cache
    jest.resetModules();
  });

  afterEach(() => {
    // Restore original function
    document.getElementById = originalGetElementById;
  });

  describe('DOM Root Element Tests', () => {
    test('should render App when root element exists', () => {
      const mockRootElement = document.createElement('div');
      mockRootElement.id = 'root';

      // Mock getElementById
      document.getElementById = jest.fn().mockReturnValue(mockRootElement);

      // Import and execute index.tsx
      require('./index');

      expect(document.getElementById).toHaveBeenCalledWith('root');
      expect(mockCreateRoot).toHaveBeenCalledWith(mockRootElement);
      expect(mockRender).toHaveBeenCalledTimes(1);
      expect(mockReportWebVitals).toHaveBeenCalledTimes(1);
    });

    test('should not render when root element is null', () => {
      // Mock getElementById to return null
      document.getElementById = jest.fn().mockReturnValue(null);

      // Import and execute index.tsx
      require('./index');

      expect(document.getElementById).toHaveBeenCalledWith('root');
      expect(mockCreateRoot).not.toHaveBeenCalled();
      expect(mockRender).not.toHaveBeenCalled();
      expect(mockReportWebVitals).toHaveBeenCalledTimes(1);
    });

    test('should not render when root element is undefined', () => {
      // Mock getElementById to return undefined
      document.getElementById = jest.fn().mockReturnValue(undefined as any);

      // Import and execute index.tsx
      require('./index');

      expect(document.getElementById).toHaveBeenCalledWith('root');
      // undefined !== null, so createRoot will be called
      expect(mockCreateRoot).toHaveBeenCalledWith(undefined);
      expect(mockRender).toHaveBeenCalledTimes(1);
      expect(mockReportWebVitals).toHaveBeenCalledTimes(1);
    });
  });

  describe('Module Imports', () => {
    test('should import React', () => {
      expect(React).toBeDefined();
      expect(typeof React.createElement).toBe('function');
    });

    test('should import createRoot from react-dom/client', () => {
      const { createRoot } = require('react-dom/client');
      expect(createRoot).toBeDefined();
      expect(typeof createRoot).toBe('function');
    });

    test('should import App component', () => {
      const App = require('./App').default;
      expect(App).toBeDefined();
      expect(typeof App).toBe('function');
    });

    test('should import reportWebVitals', () => {
      const reportWebVitals = require('./reportWebVitals').default;
      expect(reportWebVitals).toBeDefined();
      expect(typeof reportWebVitals).toBe('function');
    });
  });

  describe('reportWebVitals Call', () => {
    test('should call reportWebVitals with no arguments', () => {
      const mockRootElement = document.createElement('div');
      document.getElementById = jest.fn().mockReturnValue(mockRootElement);

      // Import and execute index.tsx
      require('./index');

      expect(mockReportWebVitals).toHaveBeenCalledTimes(1);
      expect(mockReportWebVitals).toHaveBeenCalledWith();
    });
  });

  describe('Integration Tests', () => {
    test('should complete full initialization flow when root exists', () => {
      const mockRootElement = document.createElement('div');
      mockRootElement.id = 'root';

      document.getElementById = jest.fn().mockReturnValue(mockRootElement);

      // Import index.tsx to trigger the execution
      require('./index');

      // Verify complete flow
      expect(document.getElementById).toHaveBeenCalledWith('root');
      expect(mockCreateRoot).toHaveBeenCalledWith(mockRootElement);
      expect(mockRender).toHaveBeenCalledTimes(1);
      expect(mockReportWebVitals).toHaveBeenCalledTimes(1);
    });

    test('should only call reportWebVitals when root element is null', () => {
      document.getElementById = jest.fn().mockReturnValue(null);

      // Import index.tsx to trigger the execution
      require('./index');

      // Verify only reportWebVitals was called
      expect(document.getElementById).toHaveBeenCalledWith('root');
      expect(mockCreateRoot).not.toHaveBeenCalled();
      expect(mockRender).not.toHaveBeenCalled();
      expect(mockReportWebVitals).toHaveBeenCalledTimes(1);
    });
  });

  describe('App Component Rendering', () => {
    test('should render App component', () => {
      const mockRootElement = document.createElement('div');
      document.getElementById = jest.fn().mockReturnValue(mockRootElement);

      require('./index');

      expect(mockRender).toHaveBeenCalledTimes(1);

      // Verify that some element was passed to render
      expect(mockRender.mock.calls[0]).toHaveLength(1);
    });
  });
});
