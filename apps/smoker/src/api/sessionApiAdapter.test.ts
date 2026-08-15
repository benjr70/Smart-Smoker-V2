import { createApiClient } from './client';
import { createFakeBackend } from './fakeBackend';
import { createSessionApi } from './sessionApiAdapter';
import { ApiError } from 'api-transport/src';

const buildPort = (seed?: Parameters<typeof createFakeBackend>[0]) => {
  const cloud = createFakeBackend(seed);
  const device = createFakeBackend();
  const client = createApiClient(cloud, device);
  return { cloud, port: createSessionApi(client) };
};

describe('session API adapter (SessionApiPort over the deep client)', () => {
  it('getProfile resolves null (not undefined) when no profile has been saved', async () => {
    const { port } = buildPort();

    const result = await port.getProfile();

    expect(result).toBeNull();
  });

  it('getProfile resolves the normalized profile when one is saved', async () => {
    const { port } = buildPort({
      smokeProfile: {
        current: { chamberName: 'Main', probe1Name: 'p1', probe2Name: 'p2', probe3Name: 'p3' },
      },
    });

    const result = await port.getProfile();

    expect(result).toEqual({
      chamberName: 'Main',
      probe1Name: 'p1',
      probe2Name: 'p2',
      probe3Name: 'p3',
      notes: '',
      woodType: '',
    });
  });

  it('saveProfile persists the draft and resolves void', async () => {
    const { cloud, port } = buildPort();
    const profile = {
      chamberName: 'Main',
      probe1Name: 'p1',
      probe2Name: 'p2',
      probe3Name: 'p3',
      notes: 'n',
      woodType: 'Oak',
    };

    await expect(port.saveProfile(profile)).resolves.toBeUndefined();
    expect(cloud.store.smokeProfile.current).toEqual(profile);
  });

  it('getSmokingState projects the state document down to the smoking flag and its smoke', async () => {
    const { port } = buildPort({ state: { smokeId: 's1', smoking: true } });

    const result = await port.getSmokingState();

    expect(result).toEqual({ smoking: true, smokeId: 's1' });
  });

  it('toggleSmoking flips the flag and returns the new smoking state', async () => {
    const { port } = buildPort({ state: { smokeId: 's1', smoking: false } });

    const result = await port.toggleSmoking();

    expect(result).toEqual({ smoking: true, smokeId: 's1' });
  });

  // The port projects `{ smoking: state.smoking }` off the raw result, so an
  // empty-body state response (no state document / no current smoke) must
  // project rather than throw.
  it('getSmokingState projects an unknown smoking flag when no state exists', async () => {
    const { port } = buildPort({ state: null });

    await expect(port.getSmokingState()).resolves.toEqual({ smoking: undefined });
  });

  it('toggleSmoking projects an unknown smoking flag when there is no current smoke', async () => {
    const { port } = buildPort({ state: null });

    await expect(port.toggleSmoking()).resolves.toEqual({ smoking: undefined });
  });

  it('getCurrentTemps returns the current temperature series', async () => {
    const temps = [
      { ChamberTemp: 225, MeatTemp: 185, Meat2Temp: 190, Meat3Temp: 0, date: new Date() },
    ];
    const { port } = buildPort({ temps: { current: temps } });

    const result = await port.getCurrentTemps();

    expect(result).toEqual(temps);
  });

  it('postTempsBatch persists the batch and resolves void', async () => {
    const { cloud, port } = buildPort();
    const batch = [
      { ChamberTemp: 225, MeatTemp: 185, Meat2Temp: 190, Meat3Temp: 0, date: new Date() },
    ];

    await expect(port.postTempsBatch(batch)).resolves.toBeUndefined();
    expect(cloud.store.temps.batches).toEqual([batch]);
  });

  it('getCookStart reads the current cook’s recorded start as a real Date', async () => {
    const { port } = buildPort({
      state: { smokeId: 's1', smoking: true },
      timeline: { s1: { startedAt: '2026-08-15T10:00:00.000Z', finishedAt: null } },
    });

    const startedAt = await port.getCookStart();

    expect(startedAt).toBeInstanceOf(Date);
    expect(startedAt?.getTime()).toBe(new Date('2026-08-15T10:00:00.000Z').getTime());
  });

  it('getCookStart resolves null when there is no session to have started', async () => {
    const { port } = buildPort({ state: null });

    await expect(port.getCookStart()).resolves.toBeNull();
  });

  it('getCookStart reads a named cook’s stamp directly, without consulting the state', async () => {
    // No state seeded at all: with the id in hand there is nothing to consult
    // it for, so the read succeeds anyway — and costs one request, not two.
    const { port } = buildPort({
      state: null,
      timeline: { s1: { startedAt: '2026-08-15T10:00:00.000Z', finishedAt: null } },
    });

    const startedAt = await port.getCookStart('s1');

    expect(startedAt?.getTime()).toBe(new Date('2026-08-15T10:00:00.000Z').getTime());
  });

  it('getCookStart resolves null when the cook has no recorded start', async () => {
    const { port } = buildPort({
      state: { smokeId: 's1', smoking: false },
      timeline: { s1: { startedAt: null, finishedAt: null } },
    });

    await expect(port.getCookStart()).resolves.toBeNull();
  });

  it('a failing call rejects with the typed ApiError rather than resolving undefined', async () => {
    const { cloud, port } = buildPort();
    cloud.injectFault({ method: 'get', path: 'smokeProfile/current', status: 500 });

    const error = (await port.getProfile().catch(e => e)) as ApiError;

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(500);
    expect(error.method).toBe('get');
    expect(error.path).toBe('smokeProfile/current');
  });
});
