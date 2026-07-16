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
import { SmokeProfile, TempData } from './types';

export interface TempsResource {
  /** GET `temps` — the current smoke's temperature series. */
  getCurrent(): Promise<TempData[]>;
  /** GET `temps/:id` — a stored temperature series by id. */
  getById(id: string): Promise<TempData[]>;
  /** DELETE `temps/:id` — remove a stored temperature series. */
  deleteById(id: string): Promise<void>;
}

export interface SmokeProfileResource {
  /** GET `smokeProfile/current` — the current smoke's profile (normalized). */
  getCurrent(): Promise<SmokeProfile>;
  /** GET `smokeProfile/:id` — a stored profile by id (normalized). */
  getById(id: string): Promise<SmokeProfile>;
  /** POST `smokeProfile/current` — save the current profile (DTO-projected). */
  saveCurrent(profile: SmokeProfile): Promise<SmokeProfile>;
  /** DELETE `smokeProfile/:id` — remove a stored profile. */
  deleteById(id: string): Promise<void>;
}

export interface ApiClient {
  temps: TempsResource;
  smokeProfile: SmokeProfileResource;
}

/**
 * Centralized read-path normalization: the optional-on-the-wire `notes` and
 * `woodType` fields default to empty strings, applied identically to both the
 * current and by-id reads. This is the single implementation that replaces the
 * duplicated blocks that used to live in the legacy service.
 */
const normalizeProfile = (raw: SmokeProfile): SmokeProfile => ({
  ...raw,
  notes: raw.notes || '',
  woodType: raw.woodType || '',
});

/**
 * Outbound projection to the exact backend DTO whitelist (chamber name, three
 * probe names, notes, wood type). Stray persisted fields such as `_id`/`__v`
 * that ride along on a fetched-then-saved profile are stripped, preserving the
 * strict-validation-edge behavior introduced by PR #323.
 */
const toProfileDto = (profile: SmokeProfile): SmokeProfile => ({
  chamberName: profile.chamberName,
  probe1Name: profile.probe1Name,
  probe2Name: profile.probe2Name,
  probe3Name: profile.probe3Name,
  notes: profile.notes,
  woodType: profile.woodType,
});

export const createApiClient = (transport: TransportPort): ApiClient => ({
  temps: {
    getCurrent: () => transport.get<TempData[]>('temps'),
    getById: (id: string) => transport.get<TempData[]>(`temps/${id}`),
    deleteById: async (id: string) => {
      await transport.delete<void>(`temps/${id}`);
    },
  },
  smokeProfile: {
    getCurrent: async () =>
      normalizeProfile(await transport.get<SmokeProfile>('smokeProfile/current')),
    getById: async (id: string) =>
      normalizeProfile(await transport.get<SmokeProfile>(`smokeProfile/${id}`)),
    saveCurrent: (profile: SmokeProfile) =>
      transport.post<SmokeProfile>('smokeProfile/current', toProfileDto(profile)),
    deleteById: async (id: string) => {
      await transport.delete<void>(`smokeProfile/${id}`);
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
