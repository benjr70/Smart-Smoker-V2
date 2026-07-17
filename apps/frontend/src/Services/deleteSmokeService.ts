import { ApiClient, getDefaultApiClient } from '../api';

/**
 * @deprecated Use `useApiClient().smoke.deleteCascade` instead. Deprecated
 * delegating shim.
 *
 * The cascade orchestration now lives inside the deep client, which fetches the
 * parent first, deletes the five children, and deletes the parent **last** — so
 * a mid-cascade failure leaves the parent intact (retryable, no orphans). This
 * corrects the legacy ordering bug where the parent was deleted in a `finally`
 * block and vanished even when child deletes failed.
 *
 * Call-site behavior is otherwise preserved: failures are swallowed and logged
 * (the client's typed error is caught here) so existing callers keep resolving
 * without a throw and can simply retry.
 *
 * The `client` parameter is injected only by tests (fake-backend behavior
 * tests); production callers pass a single `smokeId` and get the shared client.
 */
export const deleteSmoke = async (
  smokeId: string,
  client: ApiClient = getDefaultApiClient()
): Promise<void> => {
  try {
    await client.smoke.deleteCascade(smokeId);
  } catch (error) {
    console.log(error);
  }
};
