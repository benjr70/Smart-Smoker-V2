/**
 * Transport port — the only seam that knows HTTP exists.
 *
 * Four methods over resource-relative path strings returning typed JSON.
 * Deliberately path-level (not resource-level) so that URL construction stays
 * inside each app's deep client where the in-memory fake backend exercises the
 * real paths. Production implements this with a single axios instance (see
 * httpAdapter); tests implement it with an in-memory fake backend. An app that
 * talks to more than one host (the smoker: cloud API + local device service)
 * holds one transport per base URL, so a resource call always lands on the
 * right host.
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
 * handle or report failures deliberately instead of receiving a silent
 * `undefined`. Clients throw it and never resolve `undefined`.
 *
 * This is the ONE definition shared by every app: a single class identity keeps
 * `instanceof` checks meaningful in helpers that see errors from more than one
 * app's client.
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
        `API ${params.method.toUpperCase()} ${params.path} failed${
          params.status !== undefined ? ` (status ${params.status})` : ''
        }`
    );
    this.name = 'ApiError';
    this.status = params.status;
    this.path = params.path;
    this.method = params.method;
    this.cause = params.cause;
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}
