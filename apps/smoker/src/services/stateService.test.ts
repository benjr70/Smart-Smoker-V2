import { getCurrentSmokeProfile, getState, toggleSmoking } from './stateService';
import { createApiClient } from '../api/client';
import { createFakeBackend, FakeBackend } from '../api/fakeBackend';

// Mock only the client-injection boundary: the shims delegate to the default
// client, and here that default is a client backed by an in-memory fake
// backend. Everything below the seam (real client + real fake backend) runs —
// no axios mocking, no global axios.defaults mutation.
jest.mock('../api', () => {
  const actual = jest.requireActual('../api');
  return { ...actual, getDefaultApiClient: jest.fn() };
});

// eslint-disable-next-line import/first, @typescript-eslint/no-var-requires
const api = require('../api');

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

describe('stateService (deprecated shims)', () => {
  describe('toggleSmoking', () => {
    it('returns the toggled State document', async () => {
      useBackend({ state: { smokeId: 'smoke123', smoking: false } });

      const result = await toggleSmoking();

      expect(result).toEqual({ smokeId: 'smoke123', smoking: true });
      expect(cloud.requests).toContainEqual({
        method: 'put',
        path: 'state/toggleSmoking',
        body: undefined,
      });
    });

    it('propagates the typed error on failure instead of swallowing it', async () => {
      useBackend();
      cloud.injectFault({ method: 'put', path: 'state/toggleSmoking', status: 500 });

      await expect(toggleSmoking()).rejects.toMatchObject({ status: 500 });
    });
  });

  describe('getState', () => {
    it('returns the current State document', async () => {
      useBackend({ state: { smokeId: 'current-456', smoking: true } });

      const result = await getState();

      expect(result).toEqual({ smokeId: 'current-456', smoking: true });
      expect(cloud.requests).toContainEqual({ method: 'get', path: 'state', body: undefined });
    });

    it('propagates the typed error on failure', async () => {
      useBackend();
      cloud.injectFault({ method: 'get', path: 'state', status: 404 });

      await expect(getState()).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('getCurrentSmokeProfile', () => {
    it('returns the profile with missing notes/woodType normalized to empty strings', async () => {
      useBackend({
        smokeProfile: {
          current: {
            chamberName: 'Main Chamber',
            probe1Name: 'Brisket Probe',
            probe2Name: 'Ambient Probe',
            probe3Name: 'Spare Probe',
          },
        },
      });

      const result = await getCurrentSmokeProfile();

      expect(result).toEqual({
        chamberName: 'Main Chamber',
        probe1Name: 'Brisket Probe',
        probe2Name: 'Ambient Probe',
        probe3Name: 'Spare Probe',
        notes: '',
        woodType: '',
      });
    });

    it('propagates the typed error on failure instead of swallowing it to undefined', async () => {
      useBackend();
      cloud.injectFault({ method: 'get', path: 'smokeProfile/current', status: 500 });

      await expect(getCurrentSmokeProfile()).rejects.toMatchObject({ status: 500 });
    });
  });
});
