/**
 * Transport port — the only seam that knows HTTP exists.
 *
 * Four methods over resource-relative path strings returning typed JSON.
 * Deliberately path-level (not resource-level) so that URL construction stays
 * inside the deep client where the in-memory fake backend exercises the real
 * paths. Production implements this with a single axios instance
 * (see httpAdapter); tests implement it with an in-memory fake backend.
 */
export type HttpMethod = 'get' | 'post' | 'put' | 'delete';

export interface TransportPort {
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body?: unknown): Promise<T>;
  put<T>(path: string, body?: unknown): Promise<T>;
  delete<T>(path: string): Promise<T>;
}

/**
 * Typed API error. Every transport failure maps to this shape so callers can
 * handle or report failures deliberately instead of receiving silent
 * `undefined`. The client throws it and never resolves `undefined`.
 */
export class ApiError extends Error {
  readonly status: number | undefined;
  readonly path: string;
  readonly method: HttpMethod;
  readonly cause: unknown;

  constructor(params: {
    status: number | undefined;
    path: string;
    method: HttpMethod;
    cause?: unknown;
    message?: string;
  }) {
    super(
      params.message ??
        `API ${params.method.toUpperCase()} ${params.path} failed` +
          (params.status !== undefined ? ` (status ${params.status})` : '')
    );
    this.name = 'ApiError';
    this.status = params.status;
    this.path = params.path;
    this.method = params.method;
    this.cause = params.cause;
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}
