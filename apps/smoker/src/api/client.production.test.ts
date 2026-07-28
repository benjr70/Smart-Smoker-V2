/**
 * Base-URL wiring of the production client: which origin each transport is bound
 * to. The transports themselves are mocked at the shared-package boundary so the
 * assertion is about URLs, not HTTP.
 */
import { createHttpTransport } from 'api-transport/src';
import { createProductionApiClient } from './client';

jest.mock('api-transport/src', () => ({
  createHttpTransport: jest.fn(),
}));

const mockCreateHttpTransport = createHttpTransport as jest.Mock;

/** The base URLs handed to the transports, in construction order [cloud, device]. */
const constructedBaseUrls = (): (string | undefined)[] =>
  mockCreateHttpTransport.mock.calls.map(call => call[0]);

describe('createProductionApiClient — transport base URLs', () => {
  const originalDeviceUrl = process.env.REACT_APP_DEVICE_URL;
  const originalCloudUrl = process.env.REACT_APP_CLOUD_URL_API;

  beforeEach(() => {
    mockCreateHttpTransport.mockReturnValue({
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
    });
  });

  afterEach(() => {
    const restore = (key: string, value: string | undefined): void => {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    };
    restore('REACT_APP_DEVICE_URL', originalDeviceUrl);
    restore('REACT_APP_CLOUD_URL_API', originalCloudUrl);
  });

  it('binds the device transport to the device URL baked into the bundle', () => {
    process.env.REACT_APP_CLOUD_URL_API = 'http://localhost:20011/api/';
    process.env.REACT_APP_DEVICE_URL = 'http://localhost:20012';

    createProductionApiClient();

    expect(constructedBaseUrls()).toEqual([
      'http://localhost:20011/api/',
      'http://localhost:20012',
    ]);
  });

  it('binds the device transport to loopback:3003 when no device URL was baked in', () => {
    delete process.env.REACT_APP_DEVICE_URL;

    createProductionApiClient();

    expect(constructedBaseUrls()[1]).toBe('http://localhost:3003');
  });

  it('leaves both transports on the default empty-body passthrough', () => {
    // The smoker must NOT map an empty-body 200 to null. `GET state` (no state
    // document yet) and `PUT state/toggleSmoking` (no current smoke) both answer
    // with an empty body, and every call site dereferences the result unguarded
    // — `home.tsx` does `state.smoking` inside a `.then()` with no `.catch()`.
    // With `''` that reads as `undefined` and the flow continues; with `null` it
    // would throw in an unhandled rejection, so the websocket `smokeUpdate`
    // emit and the `setState` after it would never run.
    createProductionApiClient();

    const optedIn = mockCreateHttpTransport.mock.calls.filter(
      call => call[1]?.emptyBodyAsNull === true
    );
    expect(optedIn).toEqual([]);
  });
});
