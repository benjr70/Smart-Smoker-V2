import { ApiClient, createApiClient } from './client';
import { SmokeProfile, State, TempData } from './types';
import { createFakeBackend } from './fakeBackend';
import { createSessionApiPort } from './sessionApiAdapter';

/**
 * Build a stub {@link ApiClient} exposing only the resources the session API
 * adapter consumes, each backed by a jest mock so the test asserts the exact
 * delegation. Unrelated resources are left undefined — the adapter must never
 * touch them.
 */
function stubClient(overrides: {
  smokeProfile?: Partial<ApiClient['smokeProfile']>;
  state?: Partial<ApiClient['state']>;
  temps?: Partial<ApiClient['temps']>;
  timeline?: Partial<ApiClient['timeline']>;
}): ApiClient {
  return {
    smokeProfile: overrides.smokeProfile,
    state: overrides.state,
    temps: overrides.temps,
    timeline: overrides.timeline,
  } as unknown as ApiClient;
}

const profile: SmokeProfile = {
  chamberName: 'Main Chamber',
  probe1Name: 'Point',
  probe2Name: 'Flat',
  probe3Name: 'Ambient',
  notes: 'low and slow',
  woodType: 'Hickory',
};

describe('createSessionApiPort', () => {
  test('getProfile returns the current profile from the API client', async () => {
    const getCurrent = jest.fn().mockResolvedValue(profile);
    const port = createSessionApiPort(stubClient({ smokeProfile: { getCurrent } }));

    await expect(port.getProfile()).resolves.toEqual(profile);
    expect(getCurrent).toHaveBeenCalledTimes(1);
  });

  test('saveProfile forwards the draft to the client and resolves void', async () => {
    const saveCurrent = jest.fn().mockResolvedValue(profile);
    const port = createSessionApiPort(stubClient({ smokeProfile: { saveCurrent } }));

    await expect(port.saveProfile(profile)).resolves.toBeUndefined();
    expect(saveCurrent).toHaveBeenCalledWith(profile);
  });

  test('getSmokingState projects the state singleton down to the smoking flag and its smoke', async () => {
    const get = jest.fn().mockResolvedValue({ smokeId: 'abc', smoking: true } as State);
    const port = createSessionApiPort(stubClient({ state: { get } }));

    await expect(port.getSmokingState()).resolves.toEqual({ smoking: true, smokeId: 'abc' });
  });

  test('toggleSmoking flips through the client and returns the new smoking flag', async () => {
    const toggleSmoking = jest.fn().mockResolvedValue({ smokeId: 'abc', smoking: false } as State);
    const port = createSessionApiPort(stubClient({ state: { toggleSmoking } }));

    await expect(port.toggleSmoking()).resolves.toEqual({ smoking: false, smokeId: 'abc' });
    expect(toggleSmoking).toHaveBeenCalledTimes(1);
  });

  test('getSmokingState coerces a null/empty state body to smoking:false', async () => {
    // The backend returns null when there is no active smoke; axios serializes
    // that to an empty body, so the adapter must never leak `smoking: undefined`.
    const get = jest.fn().mockResolvedValue(null as unknown as State);
    const port = createSessionApiPort(stubClient({ state: { get } }));

    await expect(port.getSmokingState()).resolves.toEqual({ smoking: false });
  });

  test('toggleSmoking coerces a null/empty state body to smoking:false', async () => {
    const toggleSmoking = jest.fn().mockResolvedValue(null as unknown as State);
    const port = createSessionApiPort(stubClient({ state: { toggleSmoking } }));

    await expect(port.toggleSmoking()).resolves.toEqual({ smoking: false });
  });

  test('getCurrentTemps returns the chart baseline from the client', async () => {
    const temps: TempData[] = [
      { ChamberTemp: 225, MeatTemp: 150, Meat2Temp: 145, Meat3Temp: 140, date: new Date() },
    ];
    const getCurrent = jest.fn().mockResolvedValue(temps);
    const port = createSessionApiPort(stubClient({ temps: { getCurrent } }));

    await expect(port.getCurrentTemps()).resolves.toEqual(temps);
  });

  test('getCurrentTemps normalizes ISO-string dates into real Date instances', async () => {
    // The transport forwards axios-parsed JSON, so `date` arrives as a string
    // at runtime despite the TempData type. The adapter must revive it so
    // consumers calling `date.getTime()` do not throw.
    const iso = '2026-07-18T12:00:00.000Z';
    const getCurrent = jest
      .fn()
      .mockResolvedValue([
        { ChamberTemp: 225, MeatTemp: 150, Meat2Temp: 145, Meat3Temp: 140, date: iso },
      ]);
    const port = createSessionApiPort(stubClient({ temps: { getCurrent } }));

    const [temp] = await port.getCurrentTemps();
    expect(temp.date).toBeInstanceOf(Date);
    expect(temp.date.getTime()).toBe(new Date(iso).getTime());
  });

  test('the baseline a reloaded smoke screen starts from is readings, not strings', async () => {
    // Over the real client this time, because that is where a stored cook is
    // turned back into numbers: the temps collection holds every reading as a
    // string, and this baseline is what the live chart draws until the next
    // frame arrives. Left as strings it draws nothing, so an operator who
    // reloaded mid-cook would watch an empty chart until the cook ended.
    const port = createSessionApiPort(
      createApiClient(
        createFakeBackend({
          temps: {
            current: [
              {
                ChamberTemp: '225',
                MeatTemp: '150',
                Meat2Temp: '0',
                Meat3Temp: '0',
                date: new Date('2026-07-18T12:00:00.000Z'),
              },
            ],
          },
        })
      )
    );

    const [temp] = await port.getCurrentTemps();

    expect(temp).toMatchObject({ ChamberTemp: 225, MeatTemp: 150, Meat2Temp: 0, Meat3Temp: 0 });
    expect(temp.date).toBeInstanceOf(Date);
  });

  test('getCookStart projects the current timeline down to its start stamp', async () => {
    const startedAt = new Date('2026-08-15T10:00:00.000Z');
    const getCurrent = jest.fn().mockResolvedValue({ startedAt, finishedAt: null });
    const port = createSessionApiPort(stubClient({ timeline: { getCurrent } }));

    await expect(port.getCookStart()).resolves.toEqual(startedAt);
  });

  test('getCookStart reads null when there is no session to have started', async () => {
    const getCurrent = jest.fn().mockResolvedValue(null);
    const port = createSessionApiPort(stubClient({ timeline: { getCurrent } }));

    await expect(port.getCookStart()).resolves.toBeNull();
  });

  test('getCookStart reads a named cook’s stamp directly, sparing the state read', async () => {
    const startedAt = new Date('2026-08-15T10:00:00.000Z');
    const getById = jest.fn().mockResolvedValue({ startedAt, finishedAt: null });
    const getCurrent = jest.fn();
    const port = createSessionApiPort(stubClient({ timeline: { getById, getCurrent } }));

    await expect(port.getCookStart('s1')).resolves.toEqual(startedAt);
    expect(getById).toHaveBeenCalledWith('s1');
    expect(getCurrent).not.toHaveBeenCalled();
  });

  test('postTempsBatch rejects: the monitor role never posts batches', async () => {
    const port = createSessionApiPort(stubClient({}));

    await expect(port.postTempsBatch([])).rejects.toThrow(/not supported for the monitor role/);
  });
});
