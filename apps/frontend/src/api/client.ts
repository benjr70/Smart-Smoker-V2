/**
 * Deep API client.
 *
 * Owns everything above the transport port: URL construction, response
 * shaping, and (in later slices) normalization, error mapping, create-vs-update
 * routing, aggregates and the ordered delete cascade. It throws typed errors —
 * it never resolves `undefined`.
 */
import { createHttpTransport } from './httpAdapter';
import { TransportPort } from './transport';
import { TempData } from './types';

export interface TempsResource {
  /** GET `temps` — the current smoke's temperature series. */
  getCurrent(): Promise<TempData[]>;
  /** GET `temps/:id` — a stored temperature series by id. */
  getById(id: string): Promise<TempData[]>;
  /** DELETE `temps/:id` — remove a stored temperature series. */
  deleteById(id: string): Promise<void>;
}

export interface ApiClient {
  temps: TempsResource;
}

export const createApiClient = (transport: TransportPort): ApiClient => ({
  temps: {
    getCurrent: () => transport.get<TempData[]>('temps'),
    getById: (id: string) => transport.get<TempData[]>(`temps/${id}`),
    deleteById: async (id: string) => {
      await transport.delete<void>(`temps/${id}`);
    },
  },
});

/** Builds the production client backed by the HTTP (axios) transport. */
export const createProductionApiClient = (): ApiClient => createApiClient(createHttpTransport());

let defaultClient: ApiClient | undefined;

/**
 * The lazily-constructed production client shared by non-React call sites (the
 * legacy service shims) and used as the React context default. Constructed once
 * on first use so importing this module never touches axios or the environment.
 */
export const getDefaultApiClient = (): ApiClient => {
  if (!defaultClient) {
    defaultClient = createProductionApiClient();
  }
  return defaultClient;
};
