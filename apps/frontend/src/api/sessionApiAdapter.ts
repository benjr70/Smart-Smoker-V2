/**
 * Session-API-port adapter.
 *
 * Bridges the shared smoke-session store's {@link SessionApiPort} to the
 * frontend's deep {@link ApiClient} (#344). The store speaks a narrow six-method
 * HTTP surface; this file maps each method onto the matching client resource,
 * projecting the client's richer return shapes down to the port's domain types.
 *
 * The monitor role (the web smoke step) never posts temperature batches — that
 * is the smoker/device host's job — so {@link SessionApiPort.postTempsBatch} is
 * an explicit, honest rejection here rather than a silent no-op, and no batch
 * endpoint is wired over the client at all.
 */
import { BatchTempDto, SessionApiPort, SmokeProfile, SmokingState } from 'smoke-session/src';
import { ApiClient } from './client';

/**
 * Adapt a frontend {@link ApiClient} into the smoke-session {@link
 * SessionApiPort}. Built for the monitor role: profile read/save, smoking
 * state read/toggle, and the chart baseline read all delegate to the client;
 * batch posting is unsupported and rejects.
 */
export function createSessionApiPort(client: ApiClient): SessionApiPort {
  return {
    getProfile(): Promise<SmokeProfile | null> {
      return client.smokeProfile.getCurrent();
    },
    async saveProfile(profile: SmokeProfile): Promise<void> {
      await client.smokeProfile.saveCurrent(profile);
    },
    async getSmokingState(): Promise<SmokingState> {
      const state = await client.state.get();
      return { smoking: state.smoking };
    },
    async toggleSmoking(): Promise<SmokingState> {
      const state = await client.state.toggleSmoking();
      return { smoking: state.smoking };
    },
    getCurrentTemps(): Promise<BatchTempDto[]> {
      return client.temps.getCurrent();
    },
    postTempsBatch(): Promise<void> {
      return Promise.reject(
        new Error('SessionApiPort.postTempsBatch is not supported for the monitor role')
      );
    },
  };
}
