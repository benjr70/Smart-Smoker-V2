import type { PhoneEnvironment } from './phoneEnvironment';
import { browserConnection, canRunVoiceFill } from './phoneEnvironment';

/** A phone that has everything Voice Fill needs. */
const capablePhone = (): PhoneEnvironment => ({
  crossOriginIsolated: true,
  navigator: {
    mediaDevices: { getUserMedia: () => Promise.resolve({}) },
    gpu: { requestAdapter: () => Promise.resolve({}) },
  },
});

describe('whether a phone can run Voice Fill', () => {
  test('it can with a microphone API, a WebGPU adapter and a cross-origin isolated page', async () => {
    await expect(canRunVoiceFill(capablePhone())).resolves.toBe(true);
  });

  test('it cannot with no microphone API', async () => {
    const phone = capablePhone();

    await expect(
      canRunVoiceFill({ ...phone, navigator: { ...phone.navigator, mediaDevices: undefined } })
    ).resolves.toBe(false);
    await expect(
      canRunVoiceFill({ ...phone, navigator: { ...phone.navigator, mediaDevices: {} } })
    ).resolves.toBe(false);
  });

  test('it cannot with no WebGPU adapter', async () => {
    const phone = capablePhone();

    // No WebGPU at all, WebGPU with no adapter to give, and WebGPU that throws.
    await expect(
      canRunVoiceFill({ ...phone, navigator: { ...phone.navigator, gpu: undefined } })
    ).resolves.toBe(false);
    await expect(
      canRunVoiceFill({
        ...phone,
        navigator: { ...phone.navigator, gpu: { requestAdapter: () => Promise.resolve(null) } },
      })
    ).resolves.toBe(false);
    await expect(
      canRunVoiceFill({
        ...phone,
        navigator: {
          ...phone.navigator,
          gpu: { requestAdapter: () => Promise.reject(new Error('lost')) },
        },
      })
    ).resolves.toBe(false);
  });

  test('it cannot on a page that is not cross-origin isolated', async () => {
    await expect(canRunVoiceFill({ ...capablePhone(), crossOriginIsolated: false })).resolves.toBe(
      false
    );
    await expect(
      canRunVoiceFill({ ...capablePhone(), crossOriginIsolated: undefined })
    ).resolves.toBe(false);
  });

  test('the test browser, which has none of it, cannot', async () => {
    await expect(canRunVoiceFill()).resolves.toBe(false);
  });
});

describe('the browser connection', () => {
  const setOnline = (online: boolean): void => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => online });
    window.dispatchEvent(new Event(online ? 'online' : 'offline'));
  };

  afterEach(() => setOnline(true));

  test('says whether the browser is online, and when that changes', () => {
    const connection = browserConnection();
    const changed = jest.fn();
    const unsubscribe = connection.subscribe(changed);

    expect(connection.isOnline()).toBe(true);

    setOnline(false);
    expect(connection.isOnline()).toBe(false);
    expect(changed).toHaveBeenCalledTimes(1);

    setOnline(true);
    expect(changed).toHaveBeenCalledTimes(2);

    unsubscribe();
    setOnline(false);
    expect(changed).toHaveBeenCalledTimes(2);
  });
});
