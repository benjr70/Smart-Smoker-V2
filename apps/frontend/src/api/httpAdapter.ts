/**
 * HTTP transport adapter — the production implementation of the transport port.
 *
 * This is the ONLY module allowed to import axios or read the cloud-URL
 * environment variable. It creates exactly one axios instance at construction
 * (no global default mutation, no per-call env read) and maps every failure to
 * a typed {@link ApiError} carrying status, path, method and the underlying
 * cause. It never resolves `undefined`: it returns `response.data` or throws.
 */
import axios from 'axios';
import { ApiError, HttpMethod, TransportPort } from './transport';

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
  baseURL: string | undefined = process.env.REACT_APP_CLOUD_URL
): TransportPort => {
  const instance = axios.create({ baseURL });

  const request = async <T>(method: HttpMethod, path: string, body?: unknown): Promise<T> => {
    try {
      const response =
        method === 'get' || method === 'delete'
          ? await instance[method](path)
          : await instance[method](path, body);
      return response.data as T;
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
