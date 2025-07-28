// Mock console.log to capture the output
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation();

describe('Renderer Process', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should log the expected message when loaded', () => {
    // Import the renderer module
    require('./renderer');
    
    expect(mockConsoleLog).toHaveBeenCalledWith(
      '👋 This message is being logged by "renderer.js", included via webpack'
    );
  });

  it('should not throw any errors when imported', () => {
    expect(() => {
      require('./renderer');
    }).not.toThrow();
  });

  it('should import index.css', () => {
    // The module imports './index.css', which should not cause errors in test environment
    expect(() => {
      require('./renderer');
    }).not.toThrow();
  });
});