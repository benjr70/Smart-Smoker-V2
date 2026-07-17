import { createApiClient } from './client';
import { createFakeBackend } from './fakeBackend';
import { createSessionApi } from './sessionApiAdapter';
import { ApiError } from './transport';

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

  it('getSmokingState projects the state document down to the smoking flag', async () => {
    const { port } = buildPort({ state: { smokeId: 's1', smoking: true } });

    const result = await port.getSmokingState();

    expect(result).toEqual({ smoking: true });
  });

  it('toggleSmoking flips the flag and returns the new smoking state', async () => {
    const { port } = buildPort({ state: { smokeId: 's1', smoking: false } });

    const result = await port.toggleSmoking();

    expect(result).toEqual({ smoking: true });
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
