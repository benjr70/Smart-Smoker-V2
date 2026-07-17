import {
  getCurrentRatings,
  setCurrentRatings,
  updateRatings,
  getRatingById,
  deleteRatingsById,
} from './ratingsService';
import { createApiClient } from '../api/client';
import { createFakeBackend, FakeBackend } from '../api/fakeBackend';
import { rating } from '../api/types';

// Mock only the client-injection boundary: the deprecated shims delegate to the
// default client, and here that default is a client backed by an in-memory fake
// backend. Everything below the seam (real client + real fake backend) runs.
jest.mock('../api', () => {
  const actual = jest.requireActual('../api');
  return { ...actual, getDefaultApiClient: jest.fn() };
});

// eslint-disable-next-line import/first, @typescript-eslint/no-var-requires
const api = require('../api');

const sampleRating: rating = {
  smokeFlavor: 8,
  seasoning: 7,
  tenderness: 9,
  overallTaste: 8,
  notes: 'Delicious!',
};

let backend: FakeBackend;

beforeEach(() => {
  backend = createFakeBackend({
    ratings: { current: sampleRating, records: { abc123: { ...sampleRating, _id: 'abc123' } } },
  });
  (api.getDefaultApiClient as jest.Mock).mockReturnValue(createApiClient(backend));
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('ratingsService (deprecated shims)', () => {
  test('getCurrentRatings resolves the current rating on success', async () => {
    const result = await getCurrentRatings();
    expect(result).toEqual(sampleRating);
    expect(backend.requests).toContainEqual({ method: 'get', path: 'ratings', body: undefined });
  });

  test('getCurrentRatings resolves undefined and logs on failure', async () => {
    backend.injectFault({ method: 'get', path: 'ratings', status: 500 });
    const consoleSpy = jest.spyOn(console, 'log');

    const result = await getCurrentRatings();

    expect(result).toBeUndefined();
    expect(consoleSpy).toHaveBeenCalledTimes(1);
  });

  test('setCurrentRatings creates via the collection path with only whitelisted fields', async () => {
    await setCurrentRatings({ ...sampleRating, _id: undefined } as rating);
    expect(backend.requests).toContainEqual({
      method: 'post',
      path: 'ratings',
      body: {
        smokeFlavor: 8,
        seasoning: 7,
        tenderness: 9,
        overallTaste: 8,
        notes: 'Delicious!',
      },
    });
  });

  test('setCurrentRatings resolves undefined and logs on failure', async () => {
    backend.injectFault({ method: 'post', path: 'ratings', status: 500 });
    const consoleSpy = jest.spyOn(console, 'log');

    const result = await setCurrentRatings(sampleRating);

    expect(result).toBeUndefined();
    expect(consoleSpy).toHaveBeenCalledTimes(1);
  });

  test('updateRatings updates the id-scoped path, stripping _id', async () => {
    await updateRatings({ ...sampleRating, _id: 'abc123' });
    const sent = backend.requests.find(r => r.method === 'post');
    expect(sent?.path).toBe('ratings/abc123');
    expect(sent?.body).not.toHaveProperty('_id');
  });

  test('updateRatings resolves undefined and logs on failure', async () => {
    backend.injectFault({ method: 'post', path: 'ratings/abc123', status: 500 });
    const consoleSpy = jest.spyOn(console, 'log');

    const result = await updateRatings({ ...sampleRating, _id: 'abc123' });

    expect(result).toBeUndefined();
    expect(consoleSpy).toHaveBeenCalledTimes(1);
  });

  test('getRatingById resolves the stored rating on success', async () => {
    const result = await getRatingById('abc123');
    expect(result).toEqual({ ...sampleRating, _id: 'abc123' });
    expect(backend.requests).toContainEqual({
      method: 'get',
      path: 'ratings/abc123',
      body: undefined,
    });
  });

  test('getRatingById resolves undefined and logs when the record is missing', async () => {
    const consoleSpy = jest.spyOn(console, 'log');

    const result = await getRatingById('missing');

    expect(result).toBeUndefined();
    expect(consoleSpy).toHaveBeenCalledTimes(1);
  });

  test('deleteRatingsById removes the record on success', async () => {
    await deleteRatingsById('abc123');
    expect(backend.store.ratings.records.abc123).toBeUndefined();
    expect(backend.requests).toContainEqual({
      method: 'delete',
      path: 'ratings/abc123',
      body: undefined,
    });
  });

  test('deleteRatingsById resolves undefined and logs on failure', async () => {
    backend.injectFault({ method: 'delete', path: 'ratings/abc123', status: 500 });
    const consoleSpy = jest.spyOn(console, 'log');

    const result = await deleteRatingsById('abc123');

    expect(result).toBeUndefined();
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    expect(backend.store.ratings.records.abc123).toEqual({ ...sampleRating, _id: 'abc123' });
  });
});
