/**
 * Deep smoker API client.
 *
 * Owns everything above the transport ports: URL construction, response
 * shaping, and read-path profile normalization. It is constructed with TWO
 * transports — one for the cloud API base URL and one for the local
 * device-service base URL — and routes each resource call to the correct one.
 * It throws typed errors; it never resolves `undefined`.
 */
import { TransportPort, createHttpTransport } from 'api-transport/src';
import { resolveDeviceUrl } from './deviceUrl';
import {
  AppearancePreference,
  ProbeTargetSetting,
  SmokeProfile,
  State,
  TempData,
  WifiManager,
} from './types';

/**
 * What an installation nobody has chosen an appearance on is taken to have
 * chosen: follow the device, recorded as the scheme this panel renders until it
 * is told otherwise.
 *
 * The API layer's copy of the value the appearance resolver and the backend both
 * start from — kept here rather than imported so the wire types stay free of
 * domain imports, and pinned to the shared one by this client's tests. The
 * recorded half says dark for the reason it says dark everywhere: this device is
 * the only thing that reads it, and the wrong answer in a garage is a sheet of
 * white in an unlit room.
 */
export const DEFAULT_APPEARANCE_PREFERENCE: AppearancePreference = {
  mode: 'system',
  resolvedMode: 'dark',
};

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

/**
 * The installation-wide appearance, as the touchscreen is allowed to know it.
 *
 * A read and nothing else: the device has no colour preference of its own to
 * contribute — its panel reports light however dark the garage is — so it is
 * given no way to say one. There is no write here to disable, because there is
 * none at all.
 */
export interface AppearanceResource {
  /**
   * GET `appSettings` — the installation's stored appearance preference.
   *
   * Always a preference: an installation nobody has chosen an appearance on
   * reads as {@link DEFAULT_APPEARANCE_PREFERENCE}, so the caller has something
   * to render rather than an absence to interpret. A read that could not be made
   * rejects, which is a different thing entirely.
   */
  get(): Promise<AppearancePreference>;
}

/**
 * What the meat is being cooked to, as the installation configured it.
 *
 * A read and nothing else, like the appearance beside it: targets are set on a
 * phone, in settings, and the panel's only interest in them is drawing a line
 * at each one. There is no write here to disable, because there is none at all.
 */
export interface ProbeTargetsResource {
  /**
   * GET `appSettings` — the configured probe rows.
   *
   * Always a list: an installation nobody has configured targets on — and a
   * deployment older than the block — reads as no rows, so the caller has
   * something to map rather than an absence to interpret. A read that could not
   * be made rejects, which is a different thing entirely.
   */
  get(): Promise<ProbeTargetSetting[]>;
}

export interface ApiClient {
  state: StateResource;
  smokeProfile: SmokeProfileResource;
  temps: TempsResource;
  device: DeviceResource;
  appearance: AppearanceResource;
  probeTargets: ProbeTargetsResource;
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
  appearance: {
    get: async () => {
      // The route answers with a complete document whether or not anything has
      // ever been chosen, so the only body without an appearance block comes
      // from a deployment older than the block itself. Both mean "nothing
      // chosen here", which is the documented default rather than an absence
      // the touchscreen would have to have an opinion about.
      const response = await cloudTransport.get<{
        appearance?: AppearancePreference;
      } | null>('appSettings');
      return response?.appearance ?? DEFAULT_APPEARANCE_PREFERENCE;
    },
  },
  probeTargets: {
    get: async () => {
      // The same document the appearance comes out of, read for a different
      // block of it. Two reads rather than one shared read: they happen at
      // different moments — the appearance at boot, the targets again whenever a
      // cook starts — and a panel that is switched on for twelve hours can
      // afford a request per cook far more easily than it can afford the two
      // being coupled.
      const response = await cloudTransport.get<{
        probeTarget?: { probes?: ProbeTargetSetting[] };
      } | null>('appSettings');
      return (response?.probeTarget?.probes ?? []).map(({ slot, enabled, target }) => ({
        slot,
        enabled,
        target,
      }));
    },
  },
});

/** The cloud API base URL, read once from the environment. */
const cloudBaseUrl = (): string | undefined => process.env.REACT_APP_CLOUD_URL_API;

/** Loopback device-service origin used unless the bundle was baked with one. */
const DEVICE_FALLBACK_URL = 'http://localhost:3003';

/**
 * The device-service base URL: the per-stack URL baked into the bundle when
 * present, else the loopback default (real device, default e2e stack).
 */
const deviceBaseUrl = (): string => resolveDeviceUrl(DEVICE_FALLBACK_URL);

/** Builds the production client backed by the two HTTP (axios) transports. */
export const createProductionApiClient = (): ApiClient =>
  createApiClient(createHttpTransport(cloudBaseUrl()), createHttpTransport(deviceBaseUrl()));

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
