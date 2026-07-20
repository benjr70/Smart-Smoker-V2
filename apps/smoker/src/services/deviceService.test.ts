import { connectToWiFi, getConnection, wifiManager } from './deviceService';
import { createApiClient } from '../api/client';
import { createFakeBackend, FakeBackend } from '../api/fakeBackend';

// Mock only the client-injection boundary; everything below the seam (real
// client + real fake backend) runs. The device calls must land on the device
// transport, never the cloud transport.
jest.mock('../api', () => {
  const actual = jest.requireActual('../api');
  return { ...actual, getDefaultApiClient: jest.fn() };
});

// eslint-disable-next-line import/first, @typescript-eslint/no-var-requires
const api = require('../api');

let cloud: FakeBackend;
let device: FakeBackend;

const useBackend = (deviceSeed?: Parameters<typeof createFakeBackend>[0]) => {
  cloud = createFakeBackend();
  device = createFakeBackend(deviceSeed);
  (api.getDefaultApiClient as jest.Mock).mockReturnValue(createApiClient(cloud, device));
};

afterEach(() => {
  jest.restoreAllMocks();
});

describe('deviceService (deprecated shims)', () => {
  describe('connectToWiFi', () => {
    it('posts creds to the device-service route, not the cloud API', async () => {
      const creds: wifiManager = { ssid: 'TestNetwork', password: 'password123' };
      useBackend({ wifi: { connectResult: { success: true, message: 'Connected' } } });

      const result = await connectToWiFi(creds);

      expect(result).toEqual({ success: true, message: 'Connected' });
      expect(device.requests).toContainEqual({
        method: 'post',
        path: 'api/wifiManager/connect',
        body: creds,
      });
      expect(cloud.requests).toEqual([]);
    });

    it('propagates the typed error on failure', async () => {
      const creds: wifiManager = { ssid: 'InvalidNetwork', password: 'wrongpassword' };
      useBackend();
      device.injectFault({ method: 'post', path: 'api/wifiManager/connect', status: 500 });

      await expect(connectToWiFi(creds)).rejects.toMatchObject({ status: 500 });
    });
  });

  describe('getConnection', () => {
    it('reads the connection state from the device-service route', async () => {
      const connection = [{ ssid: 'ConnectedNetwork', status: 'connected' }];
      useBackend({ wifi: { connection } });

      const result = await getConnection();

      expect(result).toEqual(connection);
      expect(device.requests).toContainEqual({
        method: 'get',
        path: 'api/wifiManager/connection',
        body: undefined,
      });
      expect(cloud.requests).toEqual([]);
    });

    it('propagates the typed error on failure', async () => {
      useBackend();
      device.injectFault({ method: 'get', path: 'api/wifiManager/connection', status: 500 });

      await expect(getConnection()).rejects.toMatchObject({ status: 500 });
    });
  });
});
