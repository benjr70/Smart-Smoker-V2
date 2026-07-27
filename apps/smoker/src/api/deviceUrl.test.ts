import { resolveDeviceUrl } from './deviceUrl';

describe('resolveDeviceUrl', () => {
  const original = process.env.REACT_APP_DEVICE_URL;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.REACT_APP_DEVICE_URL;
    } else {
      process.env.REACT_APP_DEVICE_URL = original;
    }
  });

  it('uses the URL the bundle was built with when one was baked in', () => {
    process.env.REACT_APP_DEVICE_URL = 'http://localhost:20012';

    expect(resolveDeviceUrl('http://127.0.0.1:3003')).toBe('http://localhost:20012');
  });

  it('falls back to the loopback default when no URL was baked in', () => {
    delete process.env.REACT_APP_DEVICE_URL;

    expect(resolveDeviceUrl('http://127.0.0.1:3003')).toBe('http://127.0.0.1:3003');
  });

  it('treats an empty baked value as absent so a blank build arg cannot break the device', () => {
    process.env.REACT_APP_DEVICE_URL = '';

    expect(resolveDeviceUrl('http://127.0.0.1:3003')).toBe('http://127.0.0.1:3003');
  });
});
