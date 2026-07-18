import { createSmokerSessionApi } from './sessionApiAdapter';
import {
  getCurrentSmokeProfile,
  getState,
  toggleSmoking as toggleSmokingService,
} from '../services/stateService';
import { getCurrentTemps, postTempsBatch } from '../services/tempsService';

jest.mock('../services/stateService', () => ({
  getCurrentSmokeProfile: jest.fn(),
  getState: jest.fn(),
  toggleSmoking: jest.fn(),
}));

jest.mock('../services/tempsService', () => ({
  getCurrentTemps: jest.fn(),
  postTempsBatch: jest.fn(),
}));

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

  it('reads the persisted smoking flag from state', async () => {
    mockGetState.mockResolvedValue({ smokeId: 'abc', smoking: true });

    const api = createSmokerSessionApi();

    await expect(api.getSmokingState()).resolves.toEqual({ smoking: true });
  });

  it('flips smoking through the state service and returns the new flag', async () => {
    mockToggleSmoking.mockResolvedValue({ smokeId: 'abc', smoking: true });

    const api = createSmokerSessionApi();

    await expect(api.toggleSmoking()).resolves.toEqual({ smoking: true });
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
