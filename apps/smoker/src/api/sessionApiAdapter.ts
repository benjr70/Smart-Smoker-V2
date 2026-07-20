/**
 * Session API adapter — satisfies the shared `smoke-session` package's
 * six-method {@link SessionApiPort} over the smoker's deep client.
 *
 * This is where the smoker's cloud endpoints are mapped onto the port the
 * session store consumes: "no profile saved yet" surfaces as `null` (the client
 * already maps it), the state document is projected down to just the smoking
 * flag, and every failure propagates as the client's typed error — the port
 * never resolves `undefined`.
 */
import type { BatchTempDto, SessionApiPort, SmokeProfile, SmokingState } from 'smoke-session';
import { ApiClient } from './client';

export const createSessionApi = (client: ApiClient): SessionApiPort => ({
  getProfile: (): Promise<SmokeProfile | null> => client.smokeProfile.getCurrent(),
  saveProfile: async (profile: SmokeProfile): Promise<void> => {
    await client.smokeProfile.saveCurrent(profile);
  },
  getSmokingState: async (): Promise<SmokingState> => {
    const state = await client.state.getState();
    return { smoking: state.smoking };
  },
  toggleSmoking: async (): Promise<SmokingState> => {
    const state = await client.state.toggleSmoking();
    return { smoking: state.smoking };
  },
  getCurrentTemps: (): Promise<BatchTempDto[]> => client.temps.getCurrent(),
  postTempsBatch: (batch: BatchTempDto[]): Promise<void> => client.temps.postBatch(batch),
});
