import reportWebVitals from './reportWebVitals';

// Mock web-vitals dynamic import
const mockWebVitals = {
  getCLS: jest.fn(),
  getFID: jest.fn(),
  getFCP: jest.fn(),
  getLCP: jest.fn(),
  getTTFB: jest.fn(),
};

// Mock the dynamic import
jest.mock('web-vitals', () => mockWebVitals);

describe('reportWebVitals', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should call all web vitals functions when onPerfEntry is provided', async () => {
    const mockOnPerfEntry = jest.fn();

    // Call the function
    reportWebVitals(mockOnPerfEntry);

    // Wait for the dynamic import to resolve
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(mockWebVitals.getCLS).toHaveBeenCalledWith(mockOnPerfEntry);
    expect(mockWebVitals.getFID).toHaveBeenCalledWith(mockOnPerfEntry);
    expect(mockWebVitals.getFCP).toHaveBeenCalledWith(mockOnPerfEntry);
    expect(mockWebVitals.getLCP).toHaveBeenCalledWith(mockOnPerfEntry);
    expect(mockWebVitals.getTTFB).toHaveBeenCalledWith(mockOnPerfEntry);
  });

  it('should not call web vitals functions when onPerfEntry is not provided', async () => {
    reportWebVitals();

    // Wait a bit to ensure no async operations occur
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(mockWebVitals.getCLS).not.toHaveBeenCalled();
    expect(mockWebVitals.getFID).not.toHaveBeenCalled();
    expect(mockWebVitals.getFCP).not.toHaveBeenCalled();
    expect(mockWebVitals.getLCP).not.toHaveBeenCalled();
    expect(mockWebVitals.getTTFB).not.toHaveBeenCalled();
  });

  it('should not call web vitals functions when onPerfEntry is not a function', async () => {
    reportWebVitals('not a function' as any);

    await new Promise(resolve => setTimeout(resolve, 10));

    expect(mockWebVitals.getCLS).not.toHaveBeenCalled();
    expect(mockWebVitals.getFID).not.toHaveBeenCalled();
    expect(mockWebVitals.getFCP).not.toHaveBeenCalled();
    expect(mockWebVitals.getLCP).not.toHaveBeenCalled();
    expect(mockWebVitals.getTTFB).not.toHaveBeenCalled();
  });

  it('should handle function check correctly', () => {
    const mockOnPerfEntry = jest.fn();
    
    // This should not throw and should check if onPerfEntry is a function
    expect(() => {
      reportWebVitals(mockOnPerfEntry);
    }).not.toThrow();
  });
});