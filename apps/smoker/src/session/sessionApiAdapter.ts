import { BatchTempDto, SessionApiPort, SmokeProfile, SmokingState } from 'smoke-session/src';
import {
  getCurrentSmokeProfile,
  getState,
  toggleSmoking as toggleSmokingService,
} from '../services/stateService';
import { getCurrentTemps, postTempsBatch } from '../services/tempsService';

/**
 * The smoker-role HTTP surface, adapting the app's existing axios services to
 * the shared {@link SessionApiPort}. This is the one place the smoker maps
 * backend shapes into session domain shapes; the store and component speak only
 * the port.
 *
 * `saveProfile` is intentionally unsupported: the smoker touchscreen is a
 * display/relay for the profile (names arrive over `smokeUpdate`) and never
 * persists it, so a call is a wiring bug rather than a silent no-op.
 */
export function createSmokerSessionApi(): SessionApiPort {
  return {
    async getProfile(): Promise<SmokeProfile | null> {
      const profile = await getCurrentSmokeProfile();
      return profile ?? null;
    },
    async saveProfile(): Promise<void> {
      throw new Error('smoker role does not persist the smoke profile');
    },
    async getSmokingState(): Promise<SmokingState> {
      const state = await getState();
      return { smoking: state.smoking };
    },
    async toggleSmoking(): Promise<SmokingState> {
      const state = await toggleSmokingService();
      return { smoking: state.smoking };
    },
    async getCurrentTemps(): Promise<BatchTempDto[]> {
      return getCurrentTemps();
    },
    async postTempsBatch(batch: BatchTempDto[]): Promise<void> {
      await postTempsBatch(batch);
    },
  };
}
