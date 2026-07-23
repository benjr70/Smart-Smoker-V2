import { getCurrentTemps, deleteTempsById } from './tempsService';
import { createApiClient } from '../api/client';
import { createFakeBackend, FakeBackend } from '../api/fakeBackend';
import { TempData } from '../api/types';

// Mock only the client-injection boundary: the deprecated shims delegate to the
// default client, and here that default is a client backed by an in-memory fake
// backend. Everything below the seam (real client + real fake backend) runs.
jest.mock('../api', () => {
  const actual = jest.requireActual('../api');
  return { ...actual, getDefaultApiClient: jest.fn() };
});

// eslint-disable-next-line import/first, @typescript-eslint/no-var-requires
const api = require('../api');

const sampleTemps: TempData[] = [
  {
    ChamberTemp: 225,
    MeatTemp: 145,
    Meat2Temp: 150,
    Meat3Temp: 155,
    date: new Date('2025-01-01T12:00:00Z'),
  },
];

let backend: FakeBackend;

beforeEach(() => {
  backend = createFakeBackend({
    temps: { current: sampleTemps, records: { abc123: sampleTemps } },
  });
  (api.getDefaultApiClient as jest.Mock).mockReturnValue(createApiClient(backend));
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('tempsService (deprecated shims)', () => {
  test('getCurrentTemps resolves the current temps on success', async () => {
    const result = await getCurrentTemps();
    expect(result).toEqual(sampleTemps);
    expect(backend.requests).toContainEqual({ method: 'get', path: 'temps', body: undefined });
  });

  test('getCurrentTemps resolves undefined and logs on failure', async () => {
    backend.injectFault({ method: 'get', path: 'temps', status: 500 });
    const consoleSpy = jest.spyOn(console, 'log');

    const result = await getCurrentTemps();

    expect(result).toBeUndefined();
    expect(consoleSpy).toHaveBeenCalledTimes(1);
  });

  test('deleteTempsById removes the record and resolves on success', async () => {
    await deleteTempsById('abc123');
    expect(backend.store.temps.records.abc123).toBeUndefined();
    expect(backend.requests).toContainEqual({
      method: 'delete',
      path: 'temps/abc123',
      body: undefined,
    });
  });

  test('deleteTempsById resolves undefined and logs on failure', async () => {
    backend.injectFault({ method: 'delete', path: 'temps/abc123', status: 500 });
    const consoleSpy = jest.spyOn(console, 'log');

    const result = await deleteTempsById('abc123');

    expect(result).toBeUndefined();
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    // faulted delete must leave the record intact
    expect(backend.store.temps.records.abc123).toEqual(sampleTemps);
  });
});
