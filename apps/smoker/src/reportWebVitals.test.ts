import reportWebVitals from './reportWebVitals';

describe('reportWebVitals', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be a function', () => {
    expect(typeof reportWebVitals).toBe('function');
  });

  it('should not throw when called with a function', () => {
    const mockOnPerfEntry = jest.fn();
    expect(() => {
      reportWebVitals(mockOnPerfEntry);
    }).not.toThrow();
  });

  it('should not throw when called without arguments', () => {
    expect(() => {
      reportWebVitals();
    }).not.toThrow();
  });

  it('should not throw when called with invalid arguments', () => {
    expect(() => {
      reportWebVitals('not a function' as any);
    }).not.toThrow();
    
    expect(() => {
      reportWebVitals(null as any);
    }).not.toThrow();
    
    expect(() => {
      reportWebVitals(undefined);
    }).not.toThrow();
  });

  it('should perform function type check correctly', () => {
    const validFunction = jest.fn();
    const invalidInput = 'not a function';
    
    // Both calls should not throw
    expect(() => reportWebVitals(validFunction)).not.toThrow();
    expect(() => reportWebVitals(invalidInput as any)).not.toThrow();
  });
});