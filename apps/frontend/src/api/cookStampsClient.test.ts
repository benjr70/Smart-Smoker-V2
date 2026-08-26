import { ApiError } from 'api-transport/src';
import { createApiClient } from './client';
import { createFakeBackend } from './fakeBackend';
import { DEFAULT_STAMPS, newCustomStamp } from './cookStamps';

describe('stamp catalogue client — endpoint contract', () => {
  test('reads the six defaults from an installation that has stored no catalogue', async () => {
    const backend = createFakeBackend();
    const client = createApiClient(backend);

    expect(await client.cookStamps.get()).toEqual([...DEFAULT_STAMPS]);
    expect(backend.requests.map(r => ({ method: r.method, path: r.path }))).toEqual([
      { method: 'get', path: 'appSettings' },
    ]);
  });

  test('saves the whole list on the settings route, and nothing else with it', async () => {
    const backend = createFakeBackend();
    const client = createApiClient(backend);
    const edited = [
      ...DEFAULT_STAMPS.map(stamp => (stamp.key === 'wood' ? { ...stamp, label: 'Split' } : stamp)),
      { ...newCustomStamp(), label: 'Foil Boat' },
    ];

    const saved = await client.cookStamps.save(edited);

    expect(saved).toEqual(edited);
    expect(backend.requests[0]).toMatchObject({
      method: 'post',
      path: 'appSettings',
      body: { cookLog: { stamps: edited } },
    });
    expect(await client.cookStamps.get()).toEqual(edited);
  });

  test('a saved rename is what a later tap is logged under', async () => {
    const backend = createFakeBackend({ state: { smokeId: 'smoke-1', smoking: true } });
    const client = createApiClient(backend);
    await client.cookStamps.save(
      DEFAULT_STAMPS.map(stamp => (stamp.key === 'wood' ? { ...stamp, label: 'Split' } : stamp))
    );

    const recorded = await client.cookEvents.record('wood');

    expect(recorded.label).toBe('Split');
  });

  test('a stamp the user switched off cannot be logged', async () => {
    const backend = createFakeBackend({ state: { smokeId: 'smoke-1', smoking: true } });
    const client = createApiClient(backend);
    await client.cookStamps.save(
      DEFAULT_STAMPS.map(stamp => (stamp.key === 'lid' ? { ...stamp, enabled: false } : stamp))
    );

    await expect(client.cookEvents.record('lid')).rejects.toMatchObject({ status: 400 });
    await expect(client.cookEvents.record('lid')).rejects.toBeInstanceOf(ApiError);
  });
});
