/**
 * HTTP transport adapter — the production implementation of the transport port.
 *
 * This is the ONLY module allowed to import axios. It creates exactly one axios
 * instance at construction bound to the given base URL (no global default
 * mutation, no per-call environment read — the caller owns where the base URL
 * comes from) and maps every failure to a typed {@link ApiError} carrying
 * status, path, method and the underlying cause. It never resolves `undefined`:
 * it returns `response.data` or throws.
 *
 * An app builds one of these per host it talks to (the smoker builds two: cloud
 * API and device service).
 */
import axios from 'axios';
import { ApiError, HttpMethod, TransportPort } from './transport';

export interface HttpTransportOptions {
  /**
   * Map an empty-body 200 to `null`.
   *
   * A NestJS handler that returns `null`/`undefined` serializes as HTTP 200
   * with an EMPTY body, which axios surfaces as `''`. Whether that should
   * become `null` is an APP policy, not a fact about HTTP, because it changes
   * what unguarded call sites see:
   *
   * - The frontend treats "no current resource" as `null` throughout, so it
   *   opts in and an empty body never reaches component state as a
   *   truthy-shaped empty string.
   * - The smoker does NOT opt in. Its state call sites dereference the result
   *   directly (`state.smoking` inside a `.then()` with no `.catch()`), and two
   *   live backend paths answer with an empty body — `GET state` on a fresh or
   *   reset database and `PUT state/toggleSmoking` with no current smoke. With
   *   `''` those reads yield `undefined` and the flow continues; with `null`
   *   they would throw inside an unhandled rejection.
   *
   * Defaults to `false`: a faithful passthrough of what axios returned.
   */
  emptyBodyAsNull?: boolean;
}

const toApiError = (error: unknown, method: HttpMethod, path: string): ApiError => {
  const status =
    typeof error === 'object' && error !== null && 'response' in error
      ? (error as { response?: { status?: number } }).response?.status
      : undefined;
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? (error as { message?: string }).message
      : undefined;
  return new ApiError({ status, path, method, cause: error, message });
};

export const createHttpTransport = (
  baseURL: string | undefined,
  options: HttpTransportOptions = {}
): TransportPort => {
  const instance = axios.create({ baseURL });
  const { emptyBodyAsNull = false } = options;

  const request = async <T>(method: HttpMethod, path: string, body?: unknown): Promise<T> => {
    try {
      const response =
        method === 'get' || method === 'delete'
          ? await instance[method](path)
          : await instance[method](path, body);
      // See HttpTransportOptions.emptyBodyAsNull: this is the single seam every
      // read passes through, so an opted-in app gets "no current resource" as
      // `null` uniformly across resources.
      return (emptyBodyAsNull && response.data === '' ? null : response.data) as T;
    } catch (error) {
      throw toApiError(error, method, path);
    }
  };

  return {
    get: <T>(path: string) => request<T>('get', path),
    post: <T>(path: string, body?: unknown) => request<T>('post', path, body),
    put: <T>(path: string, body?: unknown) => request<T>('put', path, body),
    delete: <T>(path: string) => request<T>('delete', path),
  };
};
