/**
 * The HTTP boundary the backend fixture talks through.
 *
 * Splitting the transport out as a small interface is what lets the fixture's
 * seed/cleanup/sweep logic be unit-tested with an in-memory double — no network
 * and no compose stack. The `FetchTransport` implementation is the thin,
 * untested-by-unit-tests edge that actually hits the backend during hermetic
 * runs.
 */
export interface HttpTransport {
  post<T>(path: string, body: unknown): Promise<T>;
  put<T>(path: string, body?: unknown): Promise<T>;
  get<T>(path: string): Promise<T>;
  delete(path: string): Promise<void>;
}

/** Real transport: JSON over `fetch`, rooted at a backend base URL. */
export class FetchTransport implements HttpTransport {
  private readonly base: string;

  constructor(baseUrl: string) {
    this.base = baseUrl.replace(/\/+$/, '');
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`POST ${path} failed (${res.status}): ${await res.text()}`);
    }
    // Some endpoints answer 2xx with an empty body (e.g. the ratings
    // save-current update branch returns no content), so tolerate an empty
    // response rather than throwing "Unexpected end of JSON input" on parse.
    return (await res.json().catch(() => ({}))) as T;
  }

  async put<T>(path: string, body: unknown = {}): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`PUT ${path} failed (${res.status}): ${await res.text()}`);
    }
    // Some endpoints (e.g. state mutations) answer with an empty body.
    return (await res.json().catch(() => ({}))) as T;
  }

  async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.base}${path}`);
    if (!res.ok) {
      throw new Error(`GET ${path} failed (${res.status}): ${await res.text()}`);
    }
    return (await res.json()) as T;
  }

  async delete(path: string): Promise<void> {
    const res = await fetch(`${this.base}${path}`, { method: 'DELETE' });
    if (!res.ok) {
      throw new Error(`DELETE ${path} failed (${res.status}): ${await res.text()}`);
    }
  }
}
