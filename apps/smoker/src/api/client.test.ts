import { createApiClient } from './client';
import { createFakeBackend } from './fakeBackend';
import { ApiError } from './transport';

const buildClient = (
  cloudSeed?: Parameters<typeof createFakeBackend>[0],
  deviceSeed?: Parameters<typeof createFakeBackend>[0]
) => {
  const cloud = createFakeBackend(cloudSeed);
  const device = createFakeBackend(deviceSeed);
  return { cloud, device, client: createApiClient(cloud, device) };
};

describe('smoker api client', () => {
  describe('state resource (cloud base URL)', () => {
    it('getState hits GET `state` on the cloud transport, not the device transport', async () => {
      const { cloud, device, client } = buildClient({
        state: { smokeId: 'smoke-1', smoking: true },
      });

      const result = await client.state.getState();

      expect(result).toEqual({ smokeId: 'smoke-1', smoking: true });
      expect(cloud.requests).toEqual([{ method: 'get', path: 'state', body: undefined }]);
      expect(device.requests).toEqual([]);
    });

    it('toggleSmoking flips the flag via PUT `state/toggleSmoking` on the cloud transport', async () => {
      const { cloud, device, client } = buildClient({
        state: { smokeId: 'smoke-1', smoking: false },
      });

      const result = await client.state.toggleSmoking();

      expect(result).toEqual({ smokeId: 'smoke-1', smoking: true });
      expect(cloud.requests).toEqual([
        { method: 'put', path: 'state/toggleSmoking', body: undefined },
      ]);
      expect(device.requests).toEqual([]);
    });
  });

  describe('smokeProfile resource (cloud base URL)', () => {
    it('getCurrent normalizes missing notes/woodType to empty strings', async () => {
      const { client } = buildClient({
        smokeProfile: {
          current: {
            chamberName: 'Main',
            probe1Name: 'p1',
            probe2Name: 'p2',
            probe3Name: 'p3',
          },
        },
      });

      const result = await client.smokeProfile.getCurrent();

      expect(result).toEqual({
        chamberName: 'Main',
        probe1Name: 'p1',
        probe2Name: 'p2',
        probe3Name: 'p3',
        notes: '',
        woodType: '',
      });
    });

    it('getCurrent resolves null (not undefined) when no profile has been saved', async () => {
      const { client } = buildClient();

      const result = await client.smokeProfile.getCurrent();

      expect(result).toBeNull();
    });

    it('saveCurrent posts to `smokeProfile/current` on the cloud transport', async () => {
      const { cloud, client } = buildClient();
      const profile = {
        chamberName: 'Main',
        probe1Name: 'p1',
        probe2Name: 'p2',
        probe3Name: 'p3',
        notes: 'n',
        woodType: 'Oak',
      };

      await client.smokeProfile.saveCurrent(profile);

      expect(cloud.requests).toEqual([
        { method: 'post', path: 'smokeProfile/current', body: profile },
      ]);
      expect(cloud.store.smokeProfile.current).toEqual(profile);
    });
  });

  describe('temps resource (cloud base URL)', () => {
    it('getCurrent hits GET `temps` on the cloud transport', async () => {
      const temps = [
        { ChamberTemp: 225, MeatTemp: 185, Meat2Temp: 190, Meat3Temp: 0, date: new Date() },
      ];
      const { cloud, device, client } = buildClient({ temps: { current: temps } });

      const result = await client.temps.getCurrent();

      expect(result).toEqual(temps);
      expect(cloud.requests).toEqual([{ method: 'get', path: 'temps', body: undefined }]);
      expect(device.requests).toEqual([]);
    });

    it('postBatch posts the batch to `temps/batch` on the cloud transport', async () => {
      const batch = [
        { ChamberTemp: 225, MeatTemp: 185, Meat2Temp: 190, Meat3Temp: 0, date: new Date() },
      ];
      const { cloud, client } = buildClient();

      await client.temps.postBatch(batch);

      expect(cloud.requests).toEqual([{ method: 'post', path: 'temps/batch', body: batch }]);
      expect(cloud.store.temps.batches).toEqual([batch]);
    });
  });

  describe('device resource (device-service base URL)', () => {
    it('connectToWiFi posts creds to the device transport, not the cloud transport', async () => {
      const creds = { ssid: 'net', password: 'pw' };
      const { cloud, device, client } = buildClient(undefined, {
        wifi: { connectResult: { success: true, message: 'Connected' } },
      });

      const result = await client.device.connectToWiFi(creds);

      expect(result).toEqual({ success: true, message: 'Connected' });
      expect(device.requests).toEqual([
        { method: 'post', path: 'api/wifiManager/connect', body: creds },
      ]);
      expect(cloud.requests).toEqual([]);
    });

    it('getConnection reads from the device transport, not the cloud transport', async () => {
      const connection = [{ ssid: 'net', status: 'connected' }];
      const { cloud, device, client } = buildClient(undefined, { wifi: { connection } });

      const result = await client.device.getConnection();

      expect(result).toEqual(connection);
      expect(device.requests).toEqual([
        { method: 'get', path: 'api/wifiManager/connection', body: undefined },
      ]);
      expect(cloud.requests).toEqual([]);
    });
  });

  describe('failure mapping', () => {
    it('surfaces an HTTP failure as the typed ApiError with method/path/status', async () => {
      const { cloud, client } = buildClient();
      cloud.injectFault({ method: 'get', path: 'temps', status: 503 });

      const error = (await client.temps.getCurrent().catch(e => e)) as ApiError;

      expect(error).toBeInstanceOf(ApiError);
      expect(error.status).toBe(503);
      expect(error.path).toBe('temps');
      expect(error.method).toBe('get');
    });
  });
});
