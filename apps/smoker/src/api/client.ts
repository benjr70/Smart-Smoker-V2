/**
 * Deep smoker API client.
 *
 * Owns everything above the transport ports: URL construction, response
 * shaping, and read-path profile normalization. It is constructed with TWO
 * transports — one for the cloud API base URL and one for the local
 * device-service base URL — and routes each resource call to the correct one.
 * It throws typed errors; it never resolves `undefined`.
 */
import { createHttpTransport } from './httpAdapter';
import { TransportPort } from './transport';
import { SmokeProfile, State, TempData, WifiManager } from './types';

export interface StateResource {
  /** GET `state` — the current smoke's persisted state. */
  getState(): Promise<State>;
  /** PUT `state/toggleSmoking` — flip the smoking flag; returns the new state. */
  toggleSmoking(): Promise<State>;
}

export interface SmokeProfileResource {
  /**
   * GET `smokeProfile/current` — the current smoke's profile, normalized so
   * `notes`/`woodType` are always strings. Resolves `null` when no profile has
   * been saved yet (never `undefined`).
   */
  getCurrent(): Promise<SmokeProfile | null>;
  /** POST `smokeProfile/current` — save the current profile. */
  saveCurrent(profile: SmokeProfile): Promise<SmokeProfile>;
}

export interface TempsResource {
  /** GET `temps` — the current smoke's temperature series. */
  getCurrent(): Promise<TempData[]>;
  /** POST `temps/batch` — persist a batch of buffered readings. */
  postBatch(batch: TempData[]): Promise<void>;
}

export interface DeviceResource {
  /** POST `api/wifiManager/connect` — join a network with the given creds. */
  connectToWiFi(creds: WifiManager): Promise<unknown>;
  /** GET `api/wifiManager/connection` — the current device connection state. */
  getConnection(): Promise<unknown>;
}

export interface ApiClient {
  state: StateResource;
  smokeProfile: SmokeProfileResource;
  temps: TempsResource;
  device: DeviceResource;
}

/**
 * Centralized read-path normalization: the optional-on-the-wire `notes` and
 * `woodType` fields default to empty strings. This is the single implementation
 * that replaces the duplicated blocks that used to live in the legacy service.
 */
const normalizeProfile = (raw: SmokeProfile): SmokeProfile => ({
  ...raw,
  notes: raw.notes || '',
  woodType: raw.woodType || '',
});

/**
 * A read response is "no profile saved yet" when it is null/undefined or an
 * empty object; both map to `null` so callers never receive `undefined` and
 * never have to guess whether a blank object means "empty" or "unsaved".
 */
const isEmptyProfile = (raw: SmokeProfile | null | undefined): boolean =>
  raw === null || raw === undefined || Object.keys(raw).length === 0;

export const createApiClient = (
  cloudTransport: TransportPort,
  deviceTransport: TransportPort
): ApiClient => ({
  state: {
    getState: () => cloudTransport.get<State>('state'),
    toggleSmoking: () => cloudTransport.put<State>('state/toggleSmoking'),
  },
  smokeProfile: {
    getCurrent: async () => {
      const raw = await cloudTransport.get<SmokeProfile | null>('smokeProfile/current');
      return isEmptyProfile(raw) ? null : normalizeProfile(raw as SmokeProfile);
    },
    saveCurrent: (profile: SmokeProfile) =>
      cloudTransport.post<SmokeProfile>('smokeProfile/current', profile),
  },
  temps: {
    getCurrent: () => cloudTransport.get<TempData[]>('temps'),
    postBatch: async (batch: TempData[]) => {
      await cloudTransport.post<unknown>('temps/batch', batch);
    },
  },
  device: {
    connectToWiFi: (creds: WifiManager) =>
      deviceTransport.post<unknown>('api/wifiManager/connect', creds),
    getConnection: () => deviceTransport.get<unknown>('api/wifiManager/connection'),
  },
});

/** The cloud API base URL, read once from the environment. */
const cloudBaseUrl = (): string | undefined => process.env.REACT_APP_CLOUD_URL_API;

/** The local device-service base URL. */
const DEVICE_BASE_URL = 'http://localhost:3003';

/** Builds the production client backed by the two HTTP (axios) transports. */
export const createProductionApiClient = (): ApiClient =>
  createApiClient(createHttpTransport(cloudBaseUrl()), createHttpTransport(DEVICE_BASE_URL));

let defaultClient: ApiClient | undefined;

/**
 * The lazily-constructed production client shared by the legacy service shims.
 * Constructed once on first use so importing this module never touches axios or
 * the environment.
 */
export const getDefaultApiClient = (): ApiClient => {
  if (!defaultClient) {
    defaultClient = createProductionApiClient();
  }
  return defaultClient;
};
