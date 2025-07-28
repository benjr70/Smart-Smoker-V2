/**
 * Tests for index.tsx module
 * Since this module has already been executed when the test runs,
 * we focus on testing the imported functions and components
 */

describe('Index module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should have App component available', () => {
    const App = require('./App').default;
    expect(App).toBeDefined();
    expect(typeof App).toBe('function');
  });

  it('should have reportWebVitals function available', () => {
    const reportWebVitals = require('./reportWebVitals').default;
    expect(reportWebVitals).toBeDefined();
    expect(typeof reportWebVitals).toBe('function');
  });

  it('should have React and ReactDOM imports working', () => {
    const React = require('react');
    const ReactDOM = require('react-dom/client');
    
    expect(React).toBeDefined();
    expect(ReactDOM).toBeDefined();
    expect(ReactDOM.createRoot).toBeDefined();
  });

  it('should be able to create a root element', () => {
    const ReactDOM = require('react-dom/client');
    const container = document.createElement('div');
    
    expect(() => {
      const root = ReactDOM.createRoot(container);
      expect(root).toBeDefined();
      expect(root.render).toBeDefined();
    }).not.toThrow();
  });

  it('should handle root element creation and rendering pattern', () => {
    const ReactDOM = require('react-dom/client');
    const React = require('react');
    const App = require('./App').default;
    
    const container = document.createElement('div');
    const root = ReactDOM.createRoot(container);
    
    expect(() => {
      root.render(
        React.createElement(React.StrictMode, null,
          React.createElement(App)
        )
      );
    }).not.toThrow();
  });
});