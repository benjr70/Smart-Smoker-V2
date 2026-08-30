import { ApiError } from 'api-transport/src';
import { createApiClient } from './client';
import { createFakeBackend } from './fakeBackend';
import { CookStamp, DEFAULT_STAMPS, newCustomStamp } from './cookStamps';

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

  // The catalogue's rules are the backend's, and a fake that stored anything
  // would let a client ship an edit production answers 400 to.
  describe('refuses a catalogue the backend would refuse', () => {
    const refusals: [string, () => unknown[]][] = [
      [
        'more than twelve stamps',
        () => [...DEFAULT_STAMPS, ...Array.from({ length: 7 }, () => newCustomStamp())],
      ],
      [
        'the same key twice',
        () => {
          const custom = newCustomStamp();
          return [...DEFAULT_STAMPS, custom, { ...custom }];
        },
      ],
      ['a dropped default', () => DEFAULT_STAMPS.filter(stamp => stamp.key !== 'lid')],
      [
        'a blank label',
        () =>
          DEFAULT_STAMPS.map(stamp => (stamp.key === 'wood' ? { ...stamp, label: '  ' } : stamp)),
      ],
      [
        'a label past sixteen characters',
        () =>
          DEFAULT_STAMPS.map(stamp =>
            stamp.key === 'wood' ? { ...stamp, label: 'Seventeen chars!!' } : stamp
          ),
      ],
      [
        'a colour that is not one of the six',
        () =>
          DEFAULT_STAMPS.map(stamp => (stamp.key === 'wood' ? { ...stamp, tone: 'puce' } : stamp)),
      ],
      [
        'a key that is neither a default nor custom-<ulid>',
        () => [
          ...DEFAULT_STAMPS,
          { key: 'mine', label: 'Mine', tone: 'amber', enabled: true, custom: true },
        ],
      ],
    ];

    test.each(refusals)('%s', async (_why, build) => {
      const backend = createFakeBackend();
      const client = createApiClient(backend);

      await expect(client.cookStamps.save(build() as CookStamp[])).rejects.toMatchObject({
        status: 400,
      });
      await expect(client.cookStamps.save(build() as CookStamp[])).rejects.toBeInstanceOf(ApiError);
      // Refused means unstored: the next read is still the shipped six.
      expect(await client.cookStamps.get()).toEqual([...DEFAULT_STAMPS]);
    });

    test('a disabled default is stored, being disabled and not removed', async () => {
      const backend = createFakeBackend();
      const client = createApiClient(backend);
      const edited = DEFAULT_STAMPS.map(stamp =>
        stamp.key === 'lid' ? { ...stamp, enabled: false } : stamp
      );

      expect(await client.cookStamps.save(edited)).toEqual(edited);
    });

    test('a refused catalogue leaves the rest of the settings document alone', async () => {
      const backend = createFakeBackend();
      const client = createApiClient(backend);
      await client.notifications.saveTargetPresets({
        beef: 210,
        pork: 195,
        poultry: 165,
        wrapTemp: 165,
      });

      await expect(
        client.cookStamps.save(DEFAULT_STAMPS.filter(stamp => stamp.key !== 'lid'))
      ).rejects.toMatchObject({ status: 400 });

      expect((await client.notifications.getSettings())?.targetPresets?.beef).toBe(210);
    });
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
