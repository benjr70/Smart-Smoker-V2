import { app, BrowserWindow } from 'electron';

// Mock electron modules
jest.mock('electron', () => ({
  app: {
    on: jest.fn(),
    quit: jest.fn(),
  },
  BrowserWindow: jest.fn().mockImplementation(() => ({
    setKiosk: jest.fn(),
    loadURL: jest.fn(),
    webContents: {
      on: jest.fn(),
      openDevTools: jest.fn(),
    },
    getAllWindows: jest.fn(),
  })),
}));

// Mock webpack constants
declare global {
  const MAIN_WINDOW_WEBPACK_ENTRY: string;
  const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;
}

(global as any).MAIN_WINDOW_WEBPACK_ENTRY = 'http://localhost:8080';
(global as any).MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY = '/path/to/preload.js';

describe('Electron Main Process', () => {
  let mockBrowserWindow: any;
  let mockApp: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockBrowserWindow = {
      setKiosk: jest.fn(),
      loadURL: jest.fn(),
      webContents: {
        on: jest.fn(),
        openDevTools: jest.fn(),
      },
    };
    
    (BrowserWindow as jest.MockedClass<typeof BrowserWindow>).mockImplementation(() => mockBrowserWindow);
    
    mockApp = app as jest.Mocked<typeof app>;
    
    // Reset getAllWindows mock
    (BrowserWindow.getAllWindows as jest.Mock).mockReturnValue([]);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    // Clear the module cache to re-import fresh instance
    jest.resetModules();
  });

  it('should set up app ready event listener', async () => {
    // Import the module to trigger the event setup
    await import('./index');
    
    expect(mockApp.on).toHaveBeenCalledWith('ready', expect.any(Function));
  });

  it('should set up window-all-closed event listener', async () => {
    await import('./index');
    
    expect(mockApp.on).toHaveBeenCalledWith('window-all-closed', expect.any(Function));
  });

  it('should set up activate event listener', async () => {
    await import('./index');
    
    expect(mockApp.on).toHaveBeenCalledWith('activate', expect.any(Function));
  });

  it('should create browser window with correct configuration when ready', async () => {
    await import('./index');
    
    // Get the ready callback and call it
    const readyCallback = mockApp.on.mock.calls.find(call => call[0] === 'ready')[1];
    readyCallback();
    
    expect(BrowserWindow).toHaveBeenCalledWith({
      height: 480,
      width: 800,
      frame: false,
      fullscreen: true,
      webPreferences: {
        sandbox: false,
        preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      },
    });
  });

  it('should set kiosk mode and load URL when window is created', async () => {
    await import('./index');
    
    // Trigger the ready event
    const readyCallback = mockApp.on.mock.calls.find(call => call[0] === 'ready')[1];
    readyCallback();
    
    expect(mockBrowserWindow.setKiosk).toHaveBeenCalledWith(true);
    expect(mockBrowserWindow.loadURL).toHaveBeenCalledWith('http://localhost:8080');
  });

  it('should handle did-fail-load event by reloading URL', async () => {
    await import('./index');
    
    // Trigger the ready event to create window
    const readyCallback = mockApp.on.mock.calls.find(call => call[0] === 'ready')[1];
    readyCallback();
    
    // Get the did-fail-load callback and call it
    const failLoadCallback = mockBrowserWindow.webContents.on.mock.calls
      .find(call => call[0] === 'did-fail-load')[1];
    failLoadCallback();
    
    expect(mockBrowserWindow.loadURL).toHaveBeenCalledWith('http://localhost:8080');
    expect(mockBrowserWindow.loadURL).toHaveBeenCalledTimes(2); // Once on create, once on fail
  });

  it('should quit app when all windows closed on non-macOS', async () => {
    // Mock process.platform to be non-macOS
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', {
      value: 'win32',
      configurable: true,
    });
    
    await import('./index');
    
    // Get the window-all-closed callback and call it
    const windowsClosedCallback = mockApp.on.mock.calls
      .find(call => call[0] === 'window-all-closed')[1];
    windowsClosedCallback();
    
    expect(mockApp.quit).toHaveBeenCalled();
    
    // Restore original platform
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
      configurable: true,
    });
  });

  it('should not quit app when all windows closed on macOS', async () => {
    // Mock process.platform to be macOS
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', {
      value: 'darwin',
      configurable: true,
    });
    
    await import('./index');
    
    // Get the window-all-closed callback and call it
    const windowsClosedCallback = mockApp.on.mock.calls
      .find(call => call[0] === 'window-all-closed')[1];
    windowsClosedCallback();
    
    expect(mockApp.quit).not.toHaveBeenCalled();
    
    // Restore original platform
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
      configurable: true,
    });
  });

  it('should create new window on activate when no windows exist', async () => {
    // Mock no existing windows
    (BrowserWindow.getAllWindows as jest.Mock).mockReturnValue([]);
    
    await import('./index');
    
    // First trigger ready to set up the createWindow function
    const readyCallback = mockApp.on.mock.calls.find(call => call[0] === 'ready')[1];
    readyCallback();
    
    // Clear the mock to count new calls
    (BrowserWindow as jest.MockedClass<typeof BrowserWindow>).mockClear();
    
    // Get the activate callback and call it
    const activateCallback = mockApp.on.mock.calls
      .find(call => call[0] === 'activate')[1];
    activateCallback();
    
    expect(BrowserWindow).toHaveBeenCalledWith({
      height: 480,
      width: 800,
      frame: false,
      fullscreen: true,
      webPreferences: {
        sandbox: false,
        preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      },
    });
  });

  it('should not create new window on activate when windows exist', async () => {
    // Mock existing windows
    const mockWindow = { id: 1 };
    (BrowserWindow.getAllWindows as jest.Mock).mockReturnValue([mockWindow]);
    
    await import('./index');
    
    // First trigger ready to set up the createWindow function
    const readyCallback = mockApp.on.mock.calls.find(call => call[0] === 'ready')[1];
    readyCallback();
    
    // Clear the mock to count new calls
    (BrowserWindow as jest.MockedClass<typeof BrowserWindow>).mockClear();
    
    // Get the activate callback and call it
    const activateCallback = mockApp.on.mock.calls
      .find(call => call[0] === 'activate')[1];
    activateCallback();
    
    expect(BrowserWindow).not.toHaveBeenCalled();
  });
});