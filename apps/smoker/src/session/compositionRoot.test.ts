import { createCloudSocketAdapter, createDeviceFeedAdapter } from 'smoke-session/src';
import { createSmokerSessionApi } from './sessionApiAdapter';
import { createWifiStatusAdapter } from './wifiStatusAdapter';
import { createSmokerSessionConfig } from './compositionRoot';

jest.mock('smoke-session/src', () => ({
  createCloudSocketAdapter: jest.fn(),
  createDeviceFeedAdapter: jest.fn(),
}));
jest.mock('./sessionApiAdapter', () => ({
  createSmokerSessionApi: jest.fn(),
}));
jest.mock('./wifiStatusAdapter', () => ({
  createWifiStatusAdapter: jest.fn(),
}));

describe('createSmokerSessionConfig', () => {
  const originalEnv = process.env.ENV;

  // CRA's jest resets mock implementations before each test, so (re)install
  // them here rather than in the jest.mock factory.
  beforeEach(() => {
    (createCloudSocketAdapter as jest.Mock).mockReturnValue({ tag: 'cloud-socket' });
    (createDeviceFeedAdapter as jest.Mock).mockReturnValue({ tag: 'device-feed' });
    (createSmokerSessionApi as jest.Mock).mockReturnValue({ tag: 'api' });
    (createWifiStatusAdapter as jest.Mock).mockReturnValue({ tag: 'wifi' });
  });

  afterEach(() => {
    process.env.ENV = originalEnv;
  });

  it('builds a smoker-role config wired to the cloud socket, device feed, api, and clock', () => {
    delete process.env.ENV;

    const config = createSmokerSessionConfig();

    expect(config.role).toBe('smoker');
    expect(config.socket).toBeDefined();
    expect(config.deviceFeed).toBeDefined();
    expect(config.api).toBeDefined();
    expect(config.clock.now()).toBeInstanceOf(Date);
  });

  it('omits wifi probing outside production', () => {
    process.env.ENV = 'development';

    expect(createSmokerSessionConfig().wifi).toBeUndefined();
  });

  it('enables throttled wifi probing in production', () => {
    process.env.ENV = 'production';

    const config = createSmokerSessionConfig();

    expect(config.wifi).toBeDefined();
    expect(config.wifi?.throttleMs).toBeGreaterThan(0);
  });

  describe('device-service socket URL', () => {
    const originalDeviceUrl = process.env.REACT_APP_DEVICE_URL;

    afterEach(() => {
      if (originalDeviceUrl === undefined) {
        delete process.env.REACT_APP_DEVICE_URL;
      } else {
        process.env.REACT_APP_DEVICE_URL = originalDeviceUrl;
      }
    });

    it('dials the device URL baked into the bundle when one was supplied', () => {
      process.env.REACT_APP_DEVICE_URL = 'http://localhost:20012';

      createSmokerSessionConfig();

      expect(createDeviceFeedAdapter).toHaveBeenCalledWith('http://localhost:20012');
      expect(createDeviceFeedAdapter).not.toHaveBeenCalledWith('http://127.0.0.1:3003');
    });

    it('dials loopback:3003 when no device URL was baked in', () => {
      delete process.env.REACT_APP_DEVICE_URL;

      createSmokerSessionConfig();

      expect(createDeviceFeedAdapter).toHaveBeenCalledWith('http://127.0.0.1:3003');
    });
  });
});
