import { State } from '../components/common/interfaces/state';
import { smokeHistory } from '../components/common/interfaces/history';
import { getDefaultApiClient } from '../api';
import { SmokeProfile } from '../api/types';

const envUrl = process.env.REACT_APP_CLOUD_URL;

/**
 * @deprecated The profile domain type now lives in the API types module
 * (`SmokeProfile`). This alias is re-exported here only so existing callers
 * importing `smokeProfile` from this service keep compiling until they migrate.
 */
export type { SmokeProfile as smokeProfile } from '../api/types';

/**
 * @deprecated Use `useApiClient().state.toggleSmoking` instead. Deprecated
 * delegating shim. Deliberately has no catch: toggle must keep **rejecting** on
 * backend failure (callers depend on the rejection), so the client's typed
 * error propagates unchanged.
 */
export const toggleSmoking = async (): Promise<State> => {
  return getDefaultApiClient().state.toggleSmoking();
};

/**
 * @deprecated Use `useApiClient().state.clearSmoke` instead. Deprecated
 * delegating shim; the websocket `clear` broadcast now happens inside the
 * client via its injected socket-backed event port (no socket created here).
 * Preserves the legacy swallow-and-log semantics.
 */
export const clearSmoke = async (): Promise<State> => {
  try {
    return await getDefaultApiClient().state.clearSmoke();
  } catch (error) {
    console.log(error);
    return undefined as unknown as State;
  }
};

/**
 * @deprecated Use `useApiClient().state.get` instead. Deprecated delegating
 * shim; preserves the legacy swallow-and-log semantics.
 */
export const getState = async (): Promise<State> => {
  try {
    return await getDefaultApiClient().state.get();
  } catch (error) {
    console.log(error);
    return undefined as unknown as State;
  }
};

/**
 * @deprecated Use `useApiClient().smokeProfile.saveCurrent` instead. Deprecated
 * delegating shim: the outbound DTO projection (stripping stray persisted
 * fields such as `_id`/`__v`) now lives inside the client. Preserves the legacy
 * swallow-and-log semantics (catch, `console.log`, resolve `undefined`).
 */
export const setSmokeProfile = async (smokeProfileDTO: SmokeProfile) => {
  try {
    return await getDefaultApiClient().smokeProfile.saveCurrent(smokeProfileDTO);
  } catch (error) {
    console.log(error);
    return undefined;
  }
};

/**
 * @deprecated Use `useApiClient().smokeProfile.getById` instead. Deprecated
 * delegating shim; the notes/wood-type empty-string normalization now lives
 * inside the client. Preserves the legacy swallow-and-log semantics.
 */
export const getSmokeProfileById = async (id: string): Promise<SmokeProfile> => {
  try {
    return await getDefaultApiClient().smokeProfile.getById(id);
  } catch (error) {
    console.log(error);
    return undefined as unknown as SmokeProfile;
  }
};

/**
 * @deprecated Use `useApiClient().smoke.finish` instead. Deprecated delegating
 * shim; preserves the legacy swallow-and-log semantics.
 */
export const FinishSmoke = async (): Promise<any> => {
  try {
    return await getDefaultApiClient().smoke.finish();
  } catch (error) {
    console.log(error);
    return undefined;
  }
};

/**
 * @deprecated Use `useApiClient().smokeProfile.getCurrent` instead. Deprecated
 * delegating shim; the notes/wood-type empty-string normalization now lives
 * inside the client. Preserves the legacy swallow-and-log semantics.
 */
export const getCurrentSmokeProfile = async (): Promise<SmokeProfile> => {
  try {
    return await getDefaultApiClient().smokeProfile.getCurrent();
  } catch (error) {
    console.log(error);
    return undefined as unknown as SmokeProfile;
  }
};

/**
 * @deprecated Use `useApiClient().history.list` instead. Deprecated delegating
 * shim; preserves the legacy swallow-and-log semantics.
 */
export const getSmokeHistory = async (): Promise<smokeHistory[]> => {
  try {
    return await getDefaultApiClient().history.list();
  } catch (error) {
    console.log(error);
    return undefined as unknown as smokeHistory[];
  }
};

/**
 * @deprecated Use `useApiClient().smoke.getAll` instead. Deprecated delegating
 * shim; preserves the legacy swallow-and-log semantics.
 */
export const getAllSmoke = async (): Promise<any> => {
  try {
    return await getDefaultApiClient().smoke.getAll();
  } catch (error) {
    console.log(error);
    return undefined;
  }
};

/**
 * @deprecated Use `useApiClient().smoke.getById` instead. Deprecated delegating
 * shim; preserves the legacy swallow-and-log semantics.
 */
export const getSmokeById = async (id: string): Promise<any> => {
  try {
    return await getDefaultApiClient().smoke.getById(id);
  } catch (error) {
    console.log(error);
    return undefined;
  }
};

/**
 * @deprecated Use `useApiClient().smokeProfile.deleteById` instead. Deprecated
 * delegating shim; preserves the legacy swallow-and-log semantics.
 */
export const deleteSmokeProfileById = async (id: string) => {
  try {
    await getDefaultApiClient().smokeProfile.deleteById(id);
  } catch (error) {
    console.log(error);
  }
};

export const deleteSmokeById = async (id: string) => {
  const axios = require('axios');
  axios.defaults.baseURL = envUrl;
  return axios.delete('smoke/' + id).catch((error: any) => {
    console.log(error);
  });
};
