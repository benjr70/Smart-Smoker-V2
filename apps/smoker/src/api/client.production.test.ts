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

const mockSocket = { emit: jest.fn() };

jest.mock('socket.io-client', () => ({
  io: jest.fn(() => mockSocket),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { io } = require('socket.io-client');

const mockCreateHttpTransport = createHttpTransport as jest.Mock;

/** The base URLs handed to the transports, in construction order [cloud, device]. */
const constructedBaseUrls = (): (string | undefined)[] =>
  mockCreateHttpTransport.mock.calls.map(call => call[0]);

describe('createProductionApiClient — transport base URLs', () => {
  const originalDeviceUrl = process.env.REACT_APP_DEVICE_URL;
  const originalCloudUrl = process.env.REACT_APP_CLOUD_URL_API;
  const originalSocketUrl = process.env.REACT_APP_CLOUD_URL;

  beforeEach(() => {
    mockCreateHttpTransport.mockReturnValue({
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
    });
    // react-scripts sets resetMocks:true, which wipes the factory
    // implementation before each test — re-establish it here.
    io.mockReturnValue(mockSocket);
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
    restore('REACT_APP_CLOUD_URL', originalSocketUrl);
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

  /**
   * The production client is paired with the socket adapter as well as the two
   * transports, so letting go of a cook is broadcast and not only written. The
   * backend rebroadcasts only what a client emits, so a panel wired without this
   * leaves its own chart — and every phone watching — drawing the archived cook
   * under the next one's readings.
   */
  it('pairs the client with the socket port, so a cleared session is announced', async () => {
    process.env.REACT_APP_CLOUD_URL = 'http://localhost:3001';

    await createProductionApiClient().session.clear();

    expect(io).toHaveBeenCalledWith('http://localhost:3001');
    expect(mockSocket.emit).toHaveBeenCalledWith('clear', true);
  });
});
