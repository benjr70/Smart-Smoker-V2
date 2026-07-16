import { getDefaultApiClient } from '../api';
import { PreSmoke } from '../api/types';

/**
 * @deprecated Use the API client (`useApiClient().preSmoke`) instead. These are
 * delegating shims that preserve the legacy swallow-and-log semantics (catch,
 * `console.log`, resolve `undefined`) until every caller has migrated, at which
 * point they will be deleted. The outbound DTO projection (strip persisted
 * `_id`/`__v`, coerce the string weight) now lives in the client's
 * `preSmoke.saveCurrent`.
 */
export const getCurrentPreSmoke = async (): Promise<PreSmoke> => {
  try {
    return await getDefaultApiClient().preSmoke.getCurrent();
  } catch (error) {
    console.log(error);
    return undefined as unknown as PreSmoke;
  }
};

/** @deprecated Use `useApiClient().preSmoke.saveCurrent` instead. */
export const setCurrentPreSmoke = async (presmoke: PreSmoke): Promise<PreSmoke | undefined> => {
  try {
    return await getDefaultApiClient().preSmoke.saveCurrent(presmoke);
  } catch (error) {
    console.log(error);
    return undefined;
  }
};

/** @deprecated Use `useApiClient().preSmoke.getById` instead. */
export const getPreSmokeById = async (id: string): Promise<PreSmoke> => {
  try {
    return await getDefaultApiClient().preSmoke.getById(id);
  } catch (error) {
    console.log(error);
    return undefined as unknown as PreSmoke;
  }
};

/** @deprecated Use `useApiClient().preSmoke.deleteById` instead. */
export const deletePreSmokeById = async (id: string): Promise<void> => {
  try {
    await getDefaultApiClient().preSmoke.deleteById(id);
  } catch (error) {
    console.log(error);
  }
};
