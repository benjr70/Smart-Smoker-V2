/**
 * Tests for index.tsx module
 * Since this module has already been executed when the test runs,
 * we focus on testing the imported functions and components
 */

export {};

describe('Index module', () => {
  let container: HTMLElement;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create a fresh container for each test
    container = document.createElement('div');
    container.id = 'root';
    document.body.appendChild(container);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    
    // Clean up the container
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
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
    const testContainer = document.createElement('div');
    
    expect(() => {
      const root = ReactDOM.createRoot(testContainer);
      expect(root).toBeDefined();
      expect(root.render).toBeDefined();
    }).not.toThrow();
  });

  it('should handle root element creation and rendering pattern', () => {
    const ReactDOM = require('react-dom/client');
    const React = require('react');
    const App = require('./App').default;
    
    const testContainer = document.createElement('div');
    const root = ReactDOM.createRoot(testContainer);
    
    expect(() => {
      root.render(
        React.createElement(React.StrictMode, null,
          React.createElement(App)
        )
      );
    }).not.toThrow();
  });

  it('should call reportWebVitals with proper execution', () => {
    const mockRootElement = document.createElement('div');
    mockRootElement.id = 'root';
    document.body.appendChild(mockRootElement);
    
    const originalGetElementById = document.getElementById;
    document.getElementById = jest.fn().mockReturnValue(mockRootElement);
    
    // Mock reportWebVitals before requiring the module
    const mockReportWebVitals = jest.fn();
    jest.doMock('./reportWebVitals', () => ({
      __esModule: true,
      default: mockReportWebVitals
    }));
    
    // Clear the require cache and re-import to test reportWebVitals call
    delete require.cache[require.resolve('./index')];
    delete require.cache[require.resolve('./reportWebVitals')];
    require('./index');
    
    expect(mockReportWebVitals).toHaveBeenCalled();
    
    // Restore and clean up
    document.getElementById = originalGetElementById;
    document.body.removeChild(mockRootElement);
    jest.dontMock('./reportWebVitals');
  });

  it('should handle missing root element gracefully', () => {
    const ReactDOM = require('react-dom/client');
    
    // Remove the root element
    const rootElement = document.getElementById('root');
    if (rootElement && rootElement.parentNode) {
      rootElement.parentNode.removeChild(rootElement);
    }
    
    // This should throw because root element is missing
    expect(() => {
      ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
    }).toThrow();
  });

  it('should verify StrictMode wrapper is applied', () => {
    const React = require('react');
    const App = require('./App').default;
    
    // Create StrictMode element like in index.tsx
    const strictModeElement = React.createElement(React.StrictMode, null,
      React.createElement(App)
    );
    
    expect(strictModeElement).toBeDefined();
    expect(strictModeElement.type).toBe(React.StrictMode);
    expect(strictModeElement.props.children.type).toBe(App);
  });
});