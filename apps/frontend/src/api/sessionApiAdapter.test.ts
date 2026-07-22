import { ApiClient } from './client';
import { SmokeProfile, State, TempData } from './types';
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
}): ApiClient {
  return {
    smokeProfile: overrides.smokeProfile,
    state: overrides.state,
    temps: overrides.temps,
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

  test('getSmokingState projects the state singleton down to the smoking flag', async () => {
    const get = jest.fn().mockResolvedValue({ smokeId: 'abc', smoking: true } as State);
    const port = createSessionApiPort(stubClient({ state: { get } }));

    await expect(port.getSmokingState()).resolves.toEqual({ smoking: true });
  });

  test('toggleSmoking flips through the client and returns the new smoking flag', async () => {
    const toggleSmoking = jest.fn().mockResolvedValue({ smokeId: 'abc', smoking: false } as State);
    const port = createSessionApiPort(stubClient({ state: { toggleSmoking } }));

    await expect(port.toggleSmoking()).resolves.toEqual({ smoking: false });
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

  test('postTempsBatch rejects: the monitor role never posts batches', async () => {
    const port = createSessionApiPort(stubClient({}));

    await expect(port.postTempsBatch([])).rejects.toThrow(/not supported for the monitor role/);
  });
});
