/**
 * Deep API client.
 *
 * Owns everything above the transport port: URL construction, response
 * shaping, and (in later slices) normalization, error mapping, create-vs-update
 * routing, aggregates and the ordered delete cascade. It throws typed errors —
 * it never resolves `undefined`.
 */
import { TransportPort, createHttpTransport } from 'api-transport/src';
import { PushNotConfiguredError } from './errors';
import { SmokeEventPort, noopEventPort } from './events';
import { createSocketEventPort } from './socketEventAdapter';
import {
  AppearancePreference,
  ApplicationSettings,
  ChamberAlertSettings,
  NotificationSettings,
  ProbeTargetAlertSettings,
  ProbeTargetEntry,
  PostSmoke,
  PreSmoke,
  PushSubscriptionPayload,
  Smoke,
  SmokeHistory,
  SmokeProfile,
  SmokeReview,
  State,
  TargetPresets,
  TempData,
  rating,
} from './types';

/**
 * The notification settings a smoker starts from — the same defaults the
 * backend serves for a deployment that has never saved any. Held here so the
 * settings page and the save projection agree about what "unset" means.
 */
export const defaultNotificationSettings = (): NotificationSettings => ({
  chamber: { enabled: false, low: 225, high: 275 },
  probeTarget: {
    enabled: false,
    probes: PROBE_SLOTS.map((slot, index) => ({
      slot,
      enabled: false,
      target: DEFAULT_PROBE_TARGET,
      targetSource: 'default',
      name: `Probe ${index + 1}`,
    })),
  },
  smokeComplete: { enabled: false },
  targetPresets: DEFAULT_TARGET_PRESETS,
});

/** The smoker's meat probe slots, in the order the settings page lists them. */
const PROBE_SLOTS = ['probe1', 'probe2', 'probe3'];

/** The target a probe carries until the user sets one — where a brisket is done. */
const DEFAULT_PROBE_TARGET = 203;

/**
 * The temperature each category of meat is taken to be done at until the user
 * says otherwise, mirroring the backend's own defaults so a deployment that has
 * never saved any renders the same three numbers the backend would seed from.
 */
const DEFAULT_TARGET_PRESETS: TargetPresets = { beef: 203, pork: 195, poultry: 165 };

/**
 * The settings document as it goes over the wire on a save: the same shape
 * without the resolved probe names, which the backend serves but will not accept.
 */
type NotificationSettingsPayload = Omit<NotificationSettings, 'probeTarget' | 'targetPresets'> & {
  probeTarget: Omit<ProbeTargetAlertSettings, 'probes'> & {
    probes: Omit<ProbeTargetEntry, 'name'>[];
  };
};

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

export interface PreSmokeResource {
  /** GET `presmoke/` — the current smoke's pre-smoke document. */
  getCurrent(): Promise<PreSmoke>;
  /** GET `presmoke/:id` — a stored pre-smoke document by id. */
  getById(id: string): Promise<PreSmoke>;
  /** POST `presmoke` — save the current pre-smoke (projected to the DTO whitelist). */
  saveCurrent(preSmoke: PreSmoke): Promise<PreSmoke>;
  /** DELETE `presmoke/:id` — remove a stored pre-smoke document. */
  deleteById(id: string): Promise<void>;
}

export interface PostSmokeResource {
  /** GET `postSmoke/current` — the current smoke's post-smoke document. */
  getCurrent(): Promise<PostSmoke>;
  /** GET `postSmoke/:id` — a stored post-smoke document by id. */
  getById(id: string): Promise<PostSmoke>;
  /** POST `postSmoke/current` — save the current post-smoke (projected to the DTO whitelist). */
  saveCurrent(postSmoke: PostSmoke): Promise<PostSmoke>;
  /** DELETE `postSmoke/:id` — remove a stored post-smoke document. */
  deleteById(id: string): Promise<void>;
}

export interface RatingsResource {
  /** GET `ratings` — the current smoke's rating. */
  getCurrent(): Promise<rating>;
  /** GET `ratings/:id` — a stored rating by id. */
  getById(id: string): Promise<rating>;
  /**
   * Persist a rating. Routes create vs update from the presence of `_id`:
   * a rating with an id updates the id-scoped path, one without creates on the
   * collection path. The outbound body is projected to the backend DTO
   * whitelist on both paths (see {@link toRatingsPayload}).
   */
  save(rating: rating): Promise<rating>;
  /** DELETE `ratings/:id` — remove a stored rating. */
  deleteById(id: string): Promise<void>;
}

export interface NotificationsResource {
  /**
   * GET `appSettings` — the alert settings, or `undefined` when the backend has
   * none yet (callers keep their defaults). The settings document is
   * application-scoped: this reads the block of it the settings page edits.
   */
  getSettings(): Promise<NotificationSettings | undefined>;
  /**
   * POST `appSettings` — projects the document to the backend DTO whitelist,
   * filling any missing field with its default and stripping the persisted
   * `_id`/`__v` a fetched-then-saved document carries. Both matter: the backend
   * validates strictly, so either a stray field or a half-filled block is a 400
   * the save-on-unmount could only swallow. Only the alert block is sent, so
   * saving alerts never disturbs the appearance.
   */
  saveSettings(input: unknown): Promise<NotificationSettings>;
  /**
   * POST `appSettings` — store the default target temps, and nothing else.
   *
   * Its own operation rather than part of {@link saveSettings} because the
   * Default target temps card and the alerts card are two writers of one
   * document, both on screen together: a save that carried the whole document
   * would undo whichever edit the other card had just made.
   */
  saveTargetPresets(presets: TargetPresets): Promise<TargetPresets>;
  /**
   * GET `notifications/publicKey` — the VAPID application server key, read from
   * the backend at subscribe time rather than baked into this bundle. Rejects
   * with a {@link PushNotConfiguredError} when the deployment has no key
   * configured, so the caller can surface "push is not set up on the server"
   * distinctly from a transient failure instead of handing `undefined` to
   * `PushManager.subscribe`.
   */
  getPublicKey(): Promise<string>;
  /**
   * POST `notifications/subscribe` — register (or re-register) this browser's
   * push subscription. The backend upserts on the endpoint, so calling this
   * with an already-known endpoint succeeds and refreshes the stored keys.
   */
  registerSubscription(subscription: PushSubscriptionPayload): Promise<void>;
  /**
   * POST `notifications/test` — dispatch a test push to every subscription and
   * resolve how many browsers it actually reached. The backend answers 200 even
   * when the push service rejected every send (it only logs those), so `sent`
   * is the only signal that separates "it arrived" from "it reached nobody" —
   * callers must branch on it rather than treating the call itself as success.
   */
  sendTest(): Promise<{ sent: number }>;
}

/**
 * What an installation nobody has chosen an appearance on is taken to have
 * chosen: follow the device, resolved the way a client with no device
 * preference of its own resolves it.
 *
 * The API layer's copy of the value the appearance resolver and the backend both
 * start from — kept here rather than imported so the wire types stay free of
 * domain imports, and pinned to the shared one by the client's tests.
 */
export const DEFAULT_APPEARANCE_PREFERENCE: AppearancePreference = {
  mode: 'system',
  resolvedMode: 'light',
};

export interface AppearanceResource {
  /**
   * GET `appSettings` — the installation's stored appearance preference.
   *
   * Always a preference: an installation nobody has chosen an appearance on
   * holds {@link DEFAULT_APPEARANCE_PREFERENCE}, so a caller has a scheme to
   * render rather than an absence to interpret. A read that cannot be made
   * rejects, which is a different thing entirely.
   */
  get(): Promise<AppearancePreference>;
  /**
   * POST `appSettings` — store the preference. Sends the appearance block
   * alone, so a browser repainting itself never writes back alert settings the
   * operator may be editing elsewhere.
   */
  save(preference: AppearancePreference): Promise<AppearancePreference>;
}

export interface StateResource {
  /** GET `state` — the current smoke-session state. */
  get(): Promise<State>;
  /** PUT `state/toggleSmoking` — flip active-smoking; rejects on failure. */
  toggleSmoking(): Promise<State>;
  /**
   * PUT `state/clearSmoke` — reset the session. Also fires the injected event
   * port's clear signal so connected devices reset; the client never touches
   * the socket library itself.
   */
  clearSmoke(): Promise<State>;
}

export interface SmokeResource {
  /** GET `smoke/:id` — a stored smoke aggregate by id. */
  getById(id: string): Promise<Smoke>;
  /** GET `smoke/all` — every stored smoke. */
  getAll(): Promise<Smoke[]>;
  /** POST `smoke/finish` — finalize the current smoke. */
  finish(): Promise<Smoke>;
  /** DELETE `smoke/:id` — remove a stored smoke parent record only. */
  deleteById(id: string): Promise<void>;
  /**
   * Ordered cascade delete replacing the buggy legacy orchestration. The parent
   * is fetched first (a typed {@link ApiError} propagates if it is missing —
   * zero deletes are issued), then the five child records are deleted, and the
   * parent is deleted **last**. A failure anywhere in the cascade rejects with
   * the typed error and leaves the parent record intact: the operation is
   * retryable and can never orphan child records.
   */
  deleteCascade(id: string): Promise<void>;
  /**
   * GET the composed review read-model for a smoke: one call that fetches the
   * parent, then its five child resources in parallel, filling any absent piece
   * with a typed default (see {@link SmokeReview}). A missing parent rejects
   * with the typed {@link ApiError}; a missing single child does not fail the
   * whole read.
   */
  getReview(id: string): Promise<SmokeReview>;
}

export interface HistoryResource {
  /** GET `history` — the denormalized history rows. */
  list(): Promise<SmokeHistory[]>;
}

export interface ApiClient {
  temps: TempsResource;
  smokeProfile: SmokeProfileResource;
  preSmoke: PreSmokeResource;
  postSmoke: PostSmokeResource;
  ratings: RatingsResource;
  notifications: NotificationsResource;
  appearance: AppearanceResource;
  state: StateResource;
  smoke: SmokeResource;
  history: HistoryResource;
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

// Coerce a weight value to a number for the backend `@IsNumber()` DTO. The UI
// text input stores the weight as a string at runtime, so a raw forward would
// 400 on the strict edge. Empty/undefined/non-numeric weights become
// `undefined` (not `NaN`, which would still fail validation) so the shape stays
// unambiguous.
const toNumericWeight = (value: unknown): number | undefined => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const numeric = Number(value);
  return Number.isNaN(numeric) ? undefined : numeric;
};

// Project a pre-smoke down to exactly the fields the backend PreSmokeDto
// whitelists. A fetched current pre-smoke document carries persisted `_id`/`__v`
// (and a `weight._id` on the nested subdocument) that the strict validation edge
// (forbidNonWhitelisted) would reject on save.
const toPreSmokePayload = (preSmoke: PreSmoke) => ({
  name: preSmoke.name,
  meatType: preSmoke.meatType,
  weight: {
    unit: preSmoke.weight?.unit,
    weight: toNumericWeight(preSmoke.weight?.weight),
  },
  steps: preSmoke.steps,
  notes: preSmoke.notes,
});

// Project a post-smoke down to exactly the fields the backend PostSmokeDto
// whitelists, so a fetched document's persisted `_id`/`__v` cannot ride along
// and trip the strict validation edge (forbidNonWhitelisted) on save.
const toPostSmokePayload = (postSmoke: PostSmoke) => ({
  restTime: postSmoke.restTime,
  steps: postSmoke.steps,
  notes: postSmoke.notes,
});

/**
 * Project a rating down to exactly the fields the backend RatingsDto whitelists.
 * The strict validation edge (forbidNonWhitelisted, introduced by PR #323)
 * rejects a body carrying stray fields such as the persisted `_id`/`__v` that
 * ride along on a fetched rating document.
 */
const toRatingsPayload = (rating: rating): rating => ({
  smokeFlavor: rating.smokeFlavor,
  seasoning: rating.seasoning,
  tenderness: rating.tenderness,
  overallTaste: rating.overallTaste,
  notes: rating.notes,
});

/**
 * Project a notification settings document onto the backend
 * ApplicationSettingsDto whitelist: exactly the alert blocks the user owns, each
 * completed from the defaults. A document read from the backend carries a
 * persisted `_id`/`__v` that the strict validation edge (forbidNonWhitelisted,
 * PR #323) rejects on save, and a partially-filled block fails its own
 * validation — this is the one place both are handled.
 */
const toNotificationSettingsPayload = (input: unknown): NotificationSettingsPayload => {
  const document = input as Partial<NotificationSettings> | null | undefined;
  const chamber = document?.chamber as Partial<ChamberAlertSettings> | undefined;
  const defaults = defaultNotificationSettings();
  return {
    chamber: {
      enabled: chamber?.enabled ?? defaults.chamber.enabled,
      low: chamber?.low ?? defaults.chamber.low,
      high: chamber?.high ?? defaults.chamber.high,
    },
    probeTarget: {
      enabled: document?.probeTarget?.enabled ?? defaults.probeTarget.enabled,
      // Named without a spread: the resolved `name` is the backend's to serve
      // and not the user's to save, and the strict edge 400s a body carrying it.
      probes: probeEntriesWithDefaults(document?.probeTarget?.probes).map(probe => ({
        slot: probe.slot,
        enabled: probe.enabled,
        target: probe.target,
        targetSource: probe.targetSource,
      })),
    },
    smokeComplete: {
      enabled: document?.smokeComplete?.enabled ?? defaults.smokeComplete.enabled,
    },
  };
};

/**
 * Exactly one entry per probe slot, in slot order, whatever subset was given —
 * mirroring the backend's own read, so a half-filled document neither saves as
 * a shorter list nor renders as fewer rows.
 */
const probeEntriesWithDefaults = (
  probes: ProbeTargetEntry[] | null | undefined
): ProbeTargetEntry[] =>
  PROBE_SLOTS.map((slot, index) => {
    const entry = probes?.find(candidate => candidate?.slot === slot);
    const target = entry?.target ?? DEFAULT_PROBE_TARGET;
    return {
      slot,
      enabled: entry?.enabled ?? false,
      target,
      targetSource: entry?.targetSource ?? inheritedProvenance(target),
      name: entry?.name?.trim() || `Probe ${index + 1}`,
    };
  });

/**
 * What a target stored before provenance was recorded has to be read as,
 * mirroring the backend's own rule.
 *
 * Editable per-probe targets shipped a release before seeding did, so a stored
 * row can carry a temperature somebody typed with nothing saying they did. Any
 * temperature that is not the shipped default got there by hand and is read as
 * theirs, so a session start never seeds over it; one still on the default is
 * indistinguishable from a row nobody opened and stays seedable.
 */
const inheritedProvenance = (target: number): TargetSource =>
  target === DEFAULT_PROBE_TARGET ? 'default' : 'user';

/**
 * The three default target temps, filling in any the document is missing — a
 * deployment older than the card has none stored, and its fields still have to
 * render numbers rather than blanks.
 */
const presetsWithDefaults = (
  presets: Partial<TargetPresets> | null | undefined
): TargetPresets => ({
  beef: presets?.beef ?? DEFAULT_TARGET_PRESETS.beef,
  pork: presets?.pork ?? DEFAULT_TARGET_PRESETS.pork,
  poultry: presets?.poultry ?? DEFAULT_TARGET_PRESETS.poultry,
});

/**
 * Per-piece typed defaults for the review aggregate. Any child resource that is
 * absent (the wire returns a 404) is filled with its default so a single
 * missing piece never fails the whole composed read. Each default is the
 * empty/neutral value for its domain type — never `undefined`.
 */
const defaultPreSmoke: PreSmoke = { weight: {}, steps: [] };
const defaultSmokeProfile: SmokeProfile = {
  chamberName: '',
  probe1Name: '',
  probe2Name: '',
  probe3Name: '',
  notes: '',
  woodType: '',
};
const defaultTemps: TempData[] = [];
const defaultPostSmoke: PostSmoke = { restTime: '', steps: [] };
const defaultRating: rating = {
  smokeFlavor: 0,
  seasoning: 0,
  tenderness: 0,
  overallTaste: 0,
  notes: '',
};

export const createApiClient = (
  transport: TransportPort,
  events: SmokeEventPort = noopEventPort
): ApiClient => ({
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
  preSmoke: {
    getCurrent: () => transport.get<PreSmoke>('presmoke/'),
    getById: (id: string) => transport.get<PreSmoke>(`presmoke/${id}`),
    saveCurrent: (preSmoke: PreSmoke) =>
      transport.post<PreSmoke>('presmoke', toPreSmokePayload(preSmoke)),
    deleteById: async (id: string) => {
      await transport.delete<void>(`presmoke/${id}`);
    },
  },
  postSmoke: {
    getCurrent: () => transport.get<PostSmoke>('postSmoke/current'),
    getById: (id: string) => transport.get<PostSmoke>(`postSmoke/${id}`),
    saveCurrent: (postSmoke: PostSmoke) =>
      transport.post<PostSmoke>('postSmoke/current', toPostSmokePayload(postSmoke)),
    deleteById: async (id: string) => {
      await transport.delete<void>(`postSmoke/${id}`);
    },
  },
  ratings: {
    getCurrent: () => transport.get<rating>('ratings'),
    getById: (id: string) => transport.get<rating>(`ratings/${id}`),
    save: (rating: rating) =>
      rating._id
        ? transport.post<rating>(`ratings/${rating._id}`, toRatingsPayload(rating))
        : transport.post<rating>('ratings', toRatingsPayload(rating)),
    deleteById: async (id: string) => {
      await transport.delete<void>(`ratings/${id}`);
    },
  },
  notifications: {
    getSettings: async () => {
      // An empty-body 200 (no settings document yet) is normalized to `null` by
      // the transport; map it to `undefined` so "nothing yet" leaves callers on
      // their safe defaults rather than blanking the form.
      const response = await transport.get<Partial<ApplicationSettings> | null>('appSettings');
      if (!response?.chamber) {
        return undefined;
      }
      // The route serves the whole application settings document. This resource
      // is the alert half of it, so the appearance block is left where it
      // belongs rather than carried through the settings page and posted back.
      //
      // The probe rows are normalized on the way in so every caller renders a
      // row per probe: a document stored before a slot existed reads back as a
      // full list, and a row the backend could not name reads back with its
      // generic label rather than with `undefined`.
      return {
        chamber: response.chamber,
        probeTarget: {
          enabled: response.probeTarget?.enabled ?? false,
          probes: probeEntriesWithDefaults(response.probeTarget?.probes),
        },
        smokeComplete: { enabled: response.smokeComplete?.enabled ?? false },
        targetPresets: presetsWithDefaults(response.targetPresets),
      };
    },
    saveSettings: (input: unknown) =>
      transport.post<NotificationSettings>('appSettings', toNotificationSettingsPayload(input)),
    saveTargetPresets: async (presets: TargetPresets) => {
      const saved = await transport.post<{ targetPresets?: TargetPresets }>('appSettings', {
        targetPresets: {
          beef: presets.beef,
          pork: presets.pork,
          poultry: presets.poultry,
        },
      });
      return saved?.targetPresets ?? presets;
    },
    getPublicKey: async () => {
      const response = await transport.get<{ publicKey: string | null } | null>(
        'notifications/publicKey'
      );
      if (!response?.publicKey) {
        throw new PushNotConfiguredError();
      }
      return response.publicKey;
    },
    registerSubscription: async (subscription: PushSubscriptionPayload) => {
      await transport.post<PushSubscriptionPayload>('notifications/subscribe', subscription);
    },
    sendTest: () => transport.post<{ sent: number }>('notifications/test'),
  },
  appearance: {
    get: async () => {
      // The route answers with a complete document whether or not anything has
      // ever been chosen, so the only body without an appearance block comes
      // from a deployment older than the block itself. Both mean "nothing
      // chosen here", which is the documented default rather than an absence
      // every caller would have to have its own opinion about.
      const response = await transport.get<{
        appearance?: AppearancePreference;
      } | null>('appSettings');
      return response?.appearance ?? DEFAULT_APPEARANCE_PREFERENCE;
    },
    save: async (preference: AppearancePreference) => {
      const saved = await transport.post<{ appearance?: AppearancePreference }>('appSettings', {
        appearance: { mode: preference.mode, resolvedMode: preference.resolvedMode },
      });
      return saved?.appearance ?? preference;
    },
  },
  state: {
    get: () => transport.get<State>('state'),
    toggleSmoking: () => transport.put<State>('state/toggleSmoking'),
    clearSmoke: () => {
      events.emitClear();
      return transport.put<State>('state/clearSmoke');
    },
  },
  smoke: {
    getById: (id: string) => transport.get<Smoke>(`smoke/${id}`),
    getAll: () => transport.get<Smoke[]>('smoke/all'),
    finish: () => transport.post<Smoke>('smoke/finish'),
    deleteById: async (id: string) => {
      await transport.delete<void>(`smoke/${id}`);
    },
    deleteCascade: async (id: string) => {
      // Fetch the parent first: a missing parent throws the typed ApiError here,
      // before any delete is issued.
      const smoke = await transport.get<Smoke>(`smoke/${id}`);
      // Delete the five children (in parallel); any rejection propagates and the
      // parent delete below is never reached, so the parent survives.
      await Promise.all([
        transport.delete<void>(`presmoke/${smoke.preSmokeId}`),
        transport.delete<void>(`smokeProfile/${smoke.smokeProfileId}`),
        transport.delete<void>(`temps/${smoke.tempsId}`),
        transport.delete<void>(`postSmoke/${smoke.postSmokeId}`),
        transport.delete<void>(`ratings/${smoke.ratingId}`),
      ]);
      // Parent last, so a partial cascade can be retried without orphaning.
      await transport.delete<void>(`smoke/${id}`);
    },
    getReview: async (id: string): Promise<SmokeReview> => {
      // Fetch the parent first: a missing parent throws the typed ApiError.
      const smoke = await transport.get<Smoke>(`smoke/${id}`);
      // Fetch the five children in parallel; each absent piece (404) falls back
      // to its typed default rather than failing the whole aggregate.
      const [preSmoke, smokeProfile, temps, postSmoke, rating] = await Promise.all([
        transport.get<PreSmoke>(`presmoke/${smoke.preSmokeId}`).catch(() => defaultPreSmoke),
        transport
          .get<SmokeProfile>(`smokeProfile/${smoke.smokeProfileId}`)
          .then(normalizeProfile)
          .catch(() => defaultSmokeProfile),
        transport.get<TempData[]>(`temps/${smoke.tempsId}`).catch(() => defaultTemps),
        transport.get<PostSmoke>(`postSmoke/${smoke.postSmokeId}`).catch(() => defaultPostSmoke),
        transport.get<rating>(`ratings/${smoke.ratingId}`).catch(() => defaultRating),
      ]);
      return { smoke, preSmoke, smokeProfile, temps, postSmoke, rating };
    },
  },
  history: {
    list: () => transport.get<SmokeHistory[]>('history'),
  },
});

/** The cloud API base URL baked into the bundle, read once at construction. */
const cloudBaseUrl = (): string | undefined => process.env.REACT_APP_CLOUD_URL;

/**
 * Builds the production client: the HTTP (axios) transport bound to the cloud
 * API base URL, plus the socket-backed event port so `clearSmoke` broadcasts
 * over the websocket. This is the single wiring site that pairs the
 * transport-pure client with its one side-effect adapter, and the only place
 * that decides where the transport points.
 */
export const createProductionApiClient = (): ApiClient =>
  createApiClient(
    // "No current resource" is `null` throughout this app — hooks and components
    // branch on it — so the empty body a NestJS `null` return produces is mapped
    // here rather than leaking `''` into component state.
    createHttpTransport(cloudBaseUrl(), { emptyBodyAsNull: true }),
    createSocketEventPort()
  );

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
