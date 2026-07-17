import { getCurrentTemps, postTempsBatch } from './tempsService';
import { createApiClient } from '../api/client';
import { createFakeBackend, FakeBackend } from '../api/fakeBackend';
import { TempData } from '../api/types';

// Mock only the client-injection boundary; everything below the seam (real
// client + real fake backend) runs — no axios mocking, no defaults mutation.
jest.mock('../api', () => {
  const actual = jest.requireActual('../api');
  return { ...actual, getDefaultApiClient: jest.fn() };
});

// eslint-disable-next-line import/first, @typescript-eslint/no-var-requires
const api = require('../api');

const sampleTemps: TempData[] = [
  {
    ChamberTemp: 225,
    MeatTemp: 185,
    Meat2Temp: 190,
    Meat3Temp: 0,
    date: new Date('2023-01-01T12:00:00Z'),
  },
];

let cloud: FakeBackend;
let device: FakeBackend;

const useBackend = (seed?: Parameters<typeof createFakeBackend>[0]) => {
  cloud = createFakeBackend(seed);
  device = createFakeBackend();
  (api.getDefaultApiClient as jest.Mock).mockReturnValue(createApiClient(cloud, device));
};

afterEach(() => {
  jest.restoreAllMocks();
});

describe('tempsService (deprecated shims)', () => {
  describe('getCurrentTemps', () => {
    it('returns the current temperature series', async () => {
      useBackend({ temps: { current: sampleTemps } });

      const result = await getCurrentTemps();

      expect(result).toEqual(sampleTemps);
      expect(cloud.requests).toContainEqual({ method: 'get', path: 'temps', body: undefined });
    });

    it('propagates the typed error on failure', async () => {
      useBackend();
      cloud.injectFault({ method: 'get', path: 'temps', status: 500 });

      await expect(getCurrentTemps()).rejects.toMatchObject({ status: 500 });
    });
  });

  describe('postTempsBatch', () => {
    it('posts the batch to the cloud `temps/batch` route', async () => {
      useBackend();

      await postTempsBatch(sampleTemps);

      expect(cloud.requests).toContainEqual({
        method: 'post',
        path: 'temps/batch',
        body: sampleTemps,
      });
      expect(cloud.store.temps.batches).toEqual([sampleTemps]);
    });

    it('propagates the typed error on failure', async () => {
      useBackend();
      cloud.injectFault({ method: 'post', path: 'temps/batch', status: 500 });

      await expect(postTempsBatch(sampleTemps)).rejects.toMatchObject({ status: 500 });
    });
  });
});
