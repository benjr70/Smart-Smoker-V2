import { getDefaultApiClient } from '../api';
import { PreSmoke } from '../api/types';

/**
 * @deprecated Use the API client (`useApiClient().preSmoke`) instead. These are
 * the remaining delegating shims that preserve the legacy swallow-and-log
 * semantics (catch, `console.log`, resolve `undefined`) for the by-id read and
 * delete still used by the history review screen and the delete cascade. They
 * will be deleted when those callers migrate in their own slices. The
 * current-document load/save shims were removed once the pre-smoke form
 * migrated to the {@link useCurrentResource} hook.
 */
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
