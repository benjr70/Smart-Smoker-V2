import { UNREPORTED, reportsIn, tempYDomain } from 'temperaturechart/src/chartGeometry';
import { createSmokerSessionApi } from './sessionApiAdapter';
import {
  getCookStart,
  getCurrentSmokeProfile,
  getState,
  toggleSmoking as toggleSmokingService,
} from '../services/stateService';
import { getCurrentTemps, postTempsBatch } from '../services/tempsService';

jest.mock('../services/stateService', () => ({
  getCookStart: jest.fn(),
  getCurrentSmokeProfile: jest.fn(),
  getState: jest.fn(),
  toggleSmoking: jest.fn(),
}));

jest.mock('../services/tempsService', () => ({
  getCurrentTemps: jest.fn(),
  postTempsBatch: jest.fn(),
}));

const mockGetCookStart = getCookStart as jest.Mock;
const mockGetProfile = getCurrentSmokeProfile as jest.Mock;
const mockGetState = getState as jest.Mock;
const mockToggleSmoking = toggleSmokingService as jest.Mock;
const mockGetCurrentTemps = getCurrentTemps as jest.Mock;
const mockPostTempsBatch = postTempsBatch as jest.Mock;

describe('createSmokerSessionApi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the current smoke profile', async () => {
    const profile = {
      chamberName: 'Pit',
      probe1Name: 'Brisket',
      probe2Name: 'Rib',
      probe3Name: 'Wing',
      notes: 'low and slow',
      woodType: 'Oak',
    };
    mockGetProfile.mockResolvedValue(profile);

    const api = createSmokerSessionApi();

    await expect(api.getProfile()).resolves.toEqual(profile);
  });

  it('maps an absent profile to null rather than undefined', async () => {
    mockGetProfile.mockResolvedValue(undefined);

    const api = createSmokerSessionApi();

    await expect(api.getProfile()).resolves.toBeNull();
  });

  it('reads the recorded cook start through the state service', async () => {
    const started = new Date('2026-08-15T10:00:00.000Z');
    mockGetCookStart.mockResolvedValue(started);

    const api = createSmokerSessionApi();

    await expect(api.getCookStart()).resolves.toEqual(started);
  });

  it('hands the state service the smoke id it was given, so the read is direct', async () => {
    const started = new Date('2026-08-15T10:00:00.000Z');
    mockGetCookStart.mockResolvedValue(started);

    const api = createSmokerSessionApi();

    await expect(api.getCookStart('s1')).resolves.toEqual(started);
    expect(mockGetCookStart).toHaveBeenCalledWith('s1');
  });

  it('reads the persisted smoking flag, and which smoke it is about, from state', async () => {
    mockGetState.mockResolvedValue({ smokeId: 'abc', smoking: true });

    const api = createSmokerSessionApi();

    await expect(api.getSmokingState()).resolves.toEqual({ smoking: true, smokeId: 'abc' });
  });

  it('flips smoking through the state service and returns the new flag', async () => {
    mockToggleSmoking.mockResolvedValue({ smokeId: 'abc', smoking: true });

    const api = createSmokerSessionApi();

    await expect(api.toggleSmoking()).resolves.toEqual({ smoking: true, smokeId: 'abc' });
    expect(mockToggleSmoking).toHaveBeenCalledTimes(1);
  });

  it('reads the chart baseline history', async () => {
    const temps = [
      { ChamberTemp: 225, MeatTemp: 150, Meat2Temp: 0, Meat3Temp: 0, date: new Date() },
    ];
    mockGetCurrentTemps.mockResolvedValue(temps);

    const api = createSmokerSessionApi();

    await expect(api.getCurrentTemps()).resolves.toEqual(temps);
  });

  it('reads a stored cook back as numbers, whatever the wire made of the readings', async () => {
    // The temps collection stores every reading as a string, so this is the
    // shape a stored cook actually comes back in — probes 2 and 3 at "0"
    // because they were never plugged in, which is what the hardware sends.
    mockGetCurrentTemps.mockResolvedValue([
      {
        ChamberTemp: '225',
        MeatTemp: '150.5',
        Meat2Temp: '0',
        Meat3Temp: '0',
        date: '2026-08-09T12:00:00.000Z',
      },
    ]);

    const api = createSmokerSessionApi();

    await expect(api.getCurrentTemps()).resolves.toEqual([
      {
        ChamberTemp: 225,
        MeatTemp: 150.5,
        Meat2Temp: 0,
        Meat3Temp: 0,
        date: '2026-08-09T12:00:00.000Z',
      },
    ]);
  });

  it('hands the chart a partial cook it can plot: the probes that reported, and no others', async () => {
    mockGetCurrentTemps.mockResolvedValue([
      { ChamberTemp: '200', MeatTemp: '100', Meat2Temp: '0', Meat3Temp: '0', date: new Date(1) },
      { ChamberTemp: '235', MeatTemp: '165', Meat2Temp: '0', Meat3Temp: '0', date: new Date(2) },
    ]);

    const api = createSmokerSessionApi();
    const cook = await api.getCurrentTemps();

    expect(reportsIn(cook, 'chamber')).toBe(true);
    expect(reportsIn(cook, 'probe1')).toBe(true);
    expect(reportsIn(cook, 'probe2')).toBe(false);
    expect(reportsIn(cook, 'probe3')).toBe(false);
    // Not the 0-100 fallback the axis collapses to when nothing plots.
    expect(tempYDomain(cook)).toEqual([75, 250]);
  });

  it('reads a reading that is no number at all as unreported rather than plotting it', async () => {
    mockGetCurrentTemps.mockResolvedValue([
      {
        ChamberTemp: 'n/a',
        MeatTemp: '',
        Meat2Temp: null,
        Meat3Temp: undefined,
        date: new Date(1),
      },
    ]);

    const api = createSmokerSessionApi();

    await expect(api.getCurrentTemps()).resolves.toEqual([
      {
        ChamberTemp: UNREPORTED,
        MeatTemp: UNREPORTED,
        Meat2Temp: UNREPORTED,
        Meat3Temp: UNREPORTED,
        date: new Date(1),
      },
    ]);
  });

  it('persists a buffered batch through the temps service', async () => {
    mockPostTempsBatch.mockResolvedValue(undefined);
    const batch = [
      { ChamberTemp: 230, MeatTemp: 160, Meat2Temp: 0, Meat3Temp: 0, date: new Date() },
    ];

    const api = createSmokerSessionApi();
    await api.postTempsBatch(batch);

    expect(mockPostTempsBatch).toHaveBeenCalledWith(batch);
  });

  it('rejects saveProfile: the smoker role never persists the profile', async () => {
    const api = createSmokerSessionApi();

    await expect(
      api.saveProfile({
        chamberName: 'Pit',
        probe1Name: 'Brisket',
        probe2Name: 'Rib',
        probe3Name: 'Wing',
        notes: '',
        woodType: '',
      })
    ).rejects.toThrow(/smoker/i);
  });
});
