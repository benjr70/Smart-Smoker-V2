/**
 * Behaviour tests for the Electron main process (`electron-app/index.ts`).
 *
 * They live under `src/` because that is the only place the smoker app's jest
 * suite discovers tests — react-scripts pins jest's `roots` to `<rootDir>/src`
 * and does not allow overriding it, so a suite next to the main process (as
 * `electron-app/index.test.ts` was) never runs at all. The module under test is
 * imported across the boundary.
 */

import { carbonDark } from 'theme/src';

jest.mock('electron', () => ({
  app: { on: jest.fn(), quit: jest.fn() },
  BrowserWindow: Object.assign(jest.fn(), { getAllWindows: jest.fn(() => []) }),
}));

const MAIN_PROCESS = '../../electron-app/index';

type MockWindow = {
  setKiosk: jest.Mock;
  loadURL: jest.Mock;
  webContents: { on: jest.Mock };
};

type MainProcess = {
  /** The mocked `electron` module the main process was loaded against. */
  electron: {
    app: { on: jest.Mock; quit: jest.Mock };
    BrowserWindow: jest.Mock & { getAllWindows: jest.Mock };
  };
  /** The window `createWindow` will hand back. */
  window: MockWindow;
  /** The handler the main process registered for an app event. */
  handler: (event: string) => () => void;
};

/** Load the main process fresh with the given environment. */
async function loadMainProcess(env: Record<string, string | undefined>): Promise<MainProcess> {
  jest.resetModules();

  // Constant Forge's webpack plugin injects at build time.
  (global as unknown as Record<string, string>).MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY = '/preload.js';

  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const electron = require('electron') as MainProcess['electron'];
  const window: MockWindow = {
    setKiosk: jest.fn(),
    loadURL: jest.fn(),
    webContents: { on: jest.fn() },
  };
  electron.BrowserWindow.mockImplementation(() => window);

  await import(MAIN_PROCESS);

  const handler = (event: string) =>
    electron.app.on.mock.calls.find(call => call[0] === event)?.[1] as () => void;

  return { electron, window, handler };
}

/** Load the main process and open its window, as the `ready` event does. */
async function openWindow(env: Record<string, string | undefined>): Promise<MockWindow> {
  const main = await loadMainProcess(env);
  main.handler('ready')();
  return main.window;
}

/** The `did-fail-load` handler the window registered. */
function failedLoadHandler(window: MockWindow): () => void {
  return window.webContents.on.mock.calls.find(
    call => call[0] === 'did-fail-load'
  )?.[1] as () => void;
}

describe('Electron main process renderer URL', () => {
  afterEach(() => {
    delete process.env.SMOKER_RENDERER_URL;
  });

  it('loads the URL the harness launcher exported', async () => {
    const window = await openWindow({ SMOKER_RENDERER_URL: 'http://127.0.0.1:41080' });

    expect(window.loadURL).toHaveBeenCalledWith('http://127.0.0.1:41080');
  });

  it('retries the same resolved URL after a failed load', async () => {
    const window = await openWindow({ SMOKER_RENDERER_URL: 'http://127.0.0.1:41080' });

    failedLoadHandler(window)();

    expect(window.loadURL).toHaveBeenCalledTimes(2);
    expect(window.loadURL).toHaveBeenNthCalledWith(2, 'http://127.0.0.1:41080');
  });

  it('loads and retries the shipping default when no override is set', async () => {
    const window = await openWindow({ SMOKER_RENDERER_URL: undefined });

    failedLoadHandler(window)();

    expect(window.loadURL.mock.calls).toEqual([
      ['http://localhost:8080'],
      ['http://localhost:8080'],
    ]);
  });
});

describe('Electron main process window lifecycle', () => {
  afterEach(() => {
    delete process.env.SMOKER_RENDERER_URL;
  });

  it('opens a fullscreen kiosk window with the preload script', async () => {
    const main = await loadMainProcess({});
    main.handler('ready')();

    expect(main.electron.BrowserWindow).toHaveBeenCalledWith({
      height: 480,
      width: 800,
      frame: false,
      fullscreen: true,
      backgroundColor: carbonDark.background,
      webPreferences: {
        sandbox: false,
        preload: '/preload.js',
      },
    });
    expect(main.window.setKiosk).toHaveBeenCalledWith(true);
  });

  /**
   * The window exists before there is a page in it, and the shell reloads into
   * it on every failed load — which, on a smoker whose wifi has dropped, is the
   * ordinary path. An unpainted window is white, so the panel in the garage
   * flashes white each time unless the window opens in the interface's own dark.
   */
  it('opens the window already painted in the touchscreen dark', async () => {
    const main = await loadMainProcess({});

    main.handler('ready')();

    expect(main.electron.BrowserWindow).toHaveBeenCalledWith(
      expect.objectContaining({ backgroundColor: carbonDark.background })
    );
  });

  it('quits when all windows close off macOS', async () => {
    const platform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

    const main = await loadMainProcess({});
    main.handler('window-all-closed')();

    expect(main.electron.app.quit).toHaveBeenCalled();

    Object.defineProperty(process, 'platform', { value: platform, configurable: true });
  });

  it('stays alive when all windows close on macOS', async () => {
    const platform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });

    const main = await loadMainProcess({});
    main.handler('window-all-closed')();

    expect(main.electron.app.quit).not.toHaveBeenCalled();

    Object.defineProperty(process, 'platform', { value: platform, configurable: true });
  });

  it('reopens a window on activate only when none is open', async () => {
    const main = await loadMainProcess({});

    main.electron.BrowserWindow.getAllWindows.mockReturnValue([]);
    main.handler('activate')();
    expect(main.electron.BrowserWindow).toHaveBeenCalledTimes(1);

    main.electron.BrowserWindow.getAllWindows.mockReturnValue([{ id: 1 }]);
    main.handler('activate')();
    expect(main.electron.BrowserWindow).toHaveBeenCalledTimes(1);
  });
});
