/**
 * Deep smoker API client.
 *
 * Owns everything above the transport ports: URL construction, response
 * shaping, and read-path profile normalization. It is constructed with TWO
 * transports — one for the cloud API base URL and one for the local
 * device-service base URL — and routes each resource call to the correct one.
 * It throws typed errors; it never resolves `undefined`.
 */
import { ApiError, TransportPort, createHttpTransport } from 'api-transport/src';
import { WireCookEvent, cookEventsFromWire } from './cookEventFrames';
import { CookStamp, normalizeStamps } from './cookStamps';
import { resolveDeviceUrl } from './deviceUrl';
import { SmokeEventPort, noopEventPort } from './events';
import { createSocketEventPort } from './socketEventAdapter';
import {
  AppearancePreference,
  CookEvent,
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

/**
 * Getting out from under a cook nobody finished.
 *
 * The three calls the phone's wizard makes when it archives a cook and moves
 * on, offered to the touchscreen as well — because the panel is where the next
 * cook is lit, and lighting one over a session the backend already stopped is
 * exactly how a finished cook's series gets a second cook appended to it.
 *
 * They are separate calls rather than one, because that is what they are on the
 * backend: an archive, a state that lets go of what it archived, and the
 * pre-smoke save that creates what comes next.
 */
export interface SessionResource {
  /**
   * POST `smoke/finish` — archive the cook the state points at.
   *
   * Sends nothing. A cook the backend auto-stopped already carries the finish
   * it really ended at, and the finish flow keeps that stamp rather than moving
   * it to the moment somebody got round to pressing the button.
   */
  finish(): Promise<void>;
  /**
   * PUT `state/clearSmoke` — leave the state pointing at no cook, and tell every
   * screen watching that it did.
   *
   * The write alone is half the job. A screen holds the cook's chart baseline
   * for as long as nothing tells it otherwise, and the backend only ever says so
   * when a client asks it to — it rebroadcasts a `clear` a client emits and
   * announces nothing by itself. So the panel emits one, exactly as the web
   * client does; without it the archived cook's series stays under the next
   * cook's readings on this screen and on every phone connected, which is the
   * pollution this recovery exists to end.
   */
  clear(): Promise<void>;
  /**
   * POST `presmoke` — begin the next session, and wait for it to *be* the
   * session.
   *
   * A pre-smoke saved while no cook is current is what creates one on the
   * backend; there is no route that makes a session any other way. The document
   * sent is the blank one the wizard's first step starts on, so what the phone
   * shows next is an empty form rather than something the panel invented.
   *
   * Resolves only once the state names the new smoke. The save is answered
   * before the smoke it creates has been linked to the state — the backend does
   * not await that write — so for a beat there is no current cook, and anything
   * done to "the current cook" in that beat is done to nothing at all: the
   * smoking toggle finds no smoke id, changes nothing, and answers with an empty
   * body nobody can tell from a flag that was already off. Rejects when the
   * session never becomes current, because that is a recovery that did not
   * happen and the panel has to be able to say so.
   */
  startNew(): Promise<void>;
}

/**
 * The blank pre-smoke a fresh session begins from — the same empty document the
 * wizard's first step starts on, spelled out here because this is the only
 * place the touchscreen ever writes one.
 */
const BLANK_PRE_SMOKE = {
  name: '',
  meatType: '',
  weight: { unit: 'LB' },
  steps: [''],
  notes: '',
};

/**
 * How long a new session is given to become the current one, and how often the
 * state is looked at while it does. Half a second is far longer than the link
 * takes and far shorter than anybody will stand in a garage wondering whether
 * the smoker is lit.
 */
const NEW_SESSION_ATTEMPTS = 10;
const NEW_SESSION_POLL_MS = 50;

/** A pause between two looks at the state. */
const pause = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Wait until the state names a cook, which is what makes a freshly created
 * session the one every other route acts on.
 *
 * A state read that fails is treated as "not yet" rather than as an answer — the
 * link may well have landed — so only the whole budget running out ends the
 * wait, and it ends it as a rejection.
 */
const awaitCurrentSmoke = async (transport: TransportPort): Promise<void> => {
  for (let attempt = 0; attempt < NEW_SESSION_ATTEMPTS; attempt += 1) {
    const current = await transport.get<State | null>('state').catch(() => null);
    if (current?.smokeId) {
      return;
    }
    await pause(NEW_SESSION_POLL_MS);
  }
  throw new ApiError({
    status: undefined,
    path: 'presmoke',
    method: 'post',
    message: 'The new session never became the current one',
  });
};

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

/**
 * The one fact of a *stored* cook's timing the touchscreen has any use for:
 * when it started, revived into a real `Date` (or `null` for a cook never
 * started). The backend's timeline document carries more — a derived duration
 * and the peaks — none of which this panel displays, so none of it is carried
 * here. The finish stamp rides on the running cook alone (see {@link
 * CurrentCookTimeline}), which is the only cook it tells the panel anything
 * about.
 */
export interface CookTimeline {
  startedAt: Date | null;
}

/**
 * How the cook in progress is going, as the backend judges it: warming up, on
 * track, stalled, off the heat, or done — and `null` when no probe is being
 * watched, so there is nothing to be going towards at all.
 *
 * The web client's own copy of this union (`frontend/src/api/types.ts`) names
 * the same five states, because both read them off the same route.
 */
export type CompletionState = 'warming' | 'ok' | 'stalled' | 'paused' | 'done';

/**
 * When the running cook will be done, as much of the backend's estimate as the
 * touchscreen has any use for: how it is going, and the moment itself.
 *
 * The estimate carries more — a rate, a progress percentage, the temperatures
 * behind them — and the web card shows all of it. This panel shows when the
 * cook will be done and how long that is away, so those two are carried and
 * nothing else is.
 */
export interface CookCompletionEstimate {
  state: CompletionState | null;
  /** When the meat is expected to reach its target. */
  eta: Date | null;
  /**
   * How long that is from now, in hours, or `null` when the backend cannot say.
   *
   * Read alongside the moment rather than worked out from it: a clock time on
   * its own does not say which day it falls on, and an overnight cook due at
   * 8:15 reads exactly like one due in ten minutes without it.
   */
  hoursRemaining: number | null;
}

/**
 * The cook in progress: when it started, whether it has already been finished,
 * and when it will be done.
 *
 * The finish stamp is here and not on {@link CookTimeline} because it means
 * something only of the *current* cook: a stamp on the cook the state still
 * points at is one the backend stopped by itself when its readings dried up,
 * and nobody has walked the End Smoke wizard on yet. That is the one thing the
 * panel has to know before it lights the smoker again.
 */
export interface CurrentCookTimeline extends CookTimeline {
  /** When the cook finished, or `null` while it is still going. */
  finishedAt: Date | null;
  estimate: CookCompletionEstimate;
}

export interface TimelineResource {
  /** GET `timeline/:id` — a named cook's timing, its stamp revived to a date. */
  getById(smokeId: string): Promise<CookTimeline>;
  /**
   * GET `timeline/current` — the cook set up right now: when it started, and
   * when it is expected to be done.
   *
   * One read of the route that owns the running cook, rather than the state
   * followed by a by-id read of whatever it pointed at: the estimate is derived
   * from three collections this panel cannot compose, and the web client reads
   * the very same route, so both screens show one answer rather than two
   * opinions. A caller that already knows the smoke's id reads {@link getById}
   * instead, which spares the derivation entirely.
   *
   * A deployment too old to serve the route rejects the read — as an unknown id
   * (400), or as nothing found (404) — and that is answered with `null` rather
   * than an error, so a panel ahead of its backend degrades to "no cook" instead
   * of failing the one screen with no reload button. Every other failure, an
   * outage above all, still rejects.
   */
  getCurrent(): Promise<CurrentCookTimeline | null>;
}

/**
 * The cook log of the cook in progress, as the panel is allowed to touch it.
 *
 * A read and a tap, and nothing else. There is no delete here because there is
 * none on the pit: a mis-tap is undone on a phone, where there is a list and a
 * keyboard, not by a gloved thumb reaching past a hot smoker for a small ×.
 */
export interface CookEventsResource {
  /**
   * POST `cook-events` — log one tap against the cook in progress.
   *
   * The stamp key is the whole request: the moment and the four temperatures
   * are the backend's to decide, from its own clock and the newest stored
   * reading. Rejects with the typed {@link ApiError} — 409 when no cook is set
   * up, 400 for a stamp the backend does not know — so the button that was
   * pressed can say "not logged" rather than claim an entry nothing stored.
   */
  record(stampKey: string): Promise<CookEvent>;
  /** GET `cook-events/current` — the in-progress cook's log, oldest first. */
  listCurrent(): Promise<CookEvent[]>;
}

/**
 * The stamps the buttons are drawn from, as the installation configured them.
 *
 * A read and nothing else, like the appearance and the targets beside it: the
 * catalogue is edited on a phone, and the panel's whole business with it is to
 * offer what it says. There is no write here to disable, because there is none
 * at all.
 */
export interface CookStampsResource {
  /**
   * GET `appSettings` — the stamps the cook log offers, in catalogue order.
   *
   * Always a catalogue: an installation that has stored none — and a deployment
   * older than the block — reads as the shipped six, so the panel has buttons
   * to draw rather than an absence it would have to have an opinion about, and
   * those six are what the backend itself falls back to when a tap arrives.
   */
  get(): Promise<CookStamp[]>;
}

export interface ApiClient {
  state: StateResource;
  session: SessionResource;
  smokeProfile: SmokeProfileResource;
  temps: TempsResource;
  device: DeviceResource;
  appearance: AppearanceResource;
  probeTargets: ProbeTargetsResource;
  timeline: TimelineResource;
  cookEvents: CookEventsResource;
  cookStamps: CookStampsResource;
}

/**
 * The running cook as JSON carries it: the start stamp and the estimated
 * moment are strings, since JSON has no date type, and the estimate block is
 * absent altogether from a deployment older than the estimator.
 */
type WireCurrentTimeline = {
  startedAt?: string | Date | null;
  finishedAt?: string | Date | null;
  estimate?: {
    state?: CompletionState | null;
    eta?: string | Date | null;
    hoursRemaining?: number | null;
  } | null;
};

/** A stamp off the wire as the moment it names, or `null` when there is none. */
const asMoment = (value: string | Date | null | undefined): Date | null => {
  if (!value) {
    return null;
  }
  const moment = value instanceof Date ? value : new Date(value);
  return Number.isNaN(moment.getTime()) ? null : moment;
};

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
  deviceTransport: TransportPort,
  events: SmokeEventPort = noopEventPort
): ApiClient => {
  const state: StateResource = {
    getState: () => cloudTransport.get<State>('state'),
    toggleSmoking: () => cloudTransport.put<State>('state/toggleSmoking'),
  };
  const session: SessionResource = {
    finish: async () => {
      await cloudTransport.post<unknown>('smoke/finish');
    },
    clear: async () => {
      await cloudTransport.put<unknown>('state/clearSmoke');
      // Announced after the write has landed, so a screen that answers the
      // signal by re-reading the session finds the cleared one rather than the
      // cook being archived.
      events.emitClear();
    },
    startNew: async () => {
      await cloudTransport.post<unknown>('presmoke', BLANK_PRE_SMOKE);
      await awaitCurrentSmoke(cloudTransport);
    },
  };
  const timeline: TimelineResource = {
    getById: async (smokeId: string) => {
      const stored = await cloudTransport.get<{
        startedAt?: string | Date | null;
      } | null>(`timeline/${smokeId}`);
      return { startedAt: asMoment(stored?.startedAt) };
    },
    getCurrent: async () => {
      const raw = await cloudTransport
        .get<WireCurrentTimeline | null>('timeline/current')
        .catch((error: unknown) => {
          // "This backend cannot say what the running cook is" — the same
          // nothing a panel with no session gets, and the same nothing the web
          // client makes of it.
          if (error instanceof ApiError && (error.status === 400 || error.status === 404)) {
            return null;
          }
          throw error;
        });
      if (!raw || typeof raw !== 'object') {
        return null;
      }
      return {
        startedAt: asMoment(raw.startedAt),
        finishedAt: asMoment(raw.finishedAt),
        // An absent estimate block — what a deployment older than the estimator
        // answers with — reads as an estimate of nothing rather than as an
        // absence the top bar would have to have an opinion about.
        estimate: {
          state: raw.estimate?.state ?? null,
          eta: asMoment(raw.estimate?.eta),
          hoursRemaining: raw.estimate?.hoursRemaining ?? null,
        },
      };
    },
  };
  return {
    state,
    session,
    timeline,
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
    cookEvents: {
      record: (stampKey: string) =>
        cloudTransport
          .post<WireCookEvent>('cook-events', { stampKey })
          .then(event => cookEventsFromWire([event])[0]),
      listCurrent: () =>
        cloudTransport.get<WireCookEvent[]>('cook-events/current').then(cookEventsFromWire),
    },
    cookStamps: {
      get: async () => {
        // The third block read out of the one settings document, on its own
        // read for the same reason the other two are: the catalogue is asked
        // for when the screen comes up and whenever the socket says it changed,
        // which are not the moments the appearance or the targets are read.
        const response = await cloudTransport.get<{
          cookLog?: { stamps?: CookStamp[] };
        } | null>('appSettings');
        return normalizeStamps(response?.cookLog?.stamps);
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
  };
};

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
  createApiClient(
    createHttpTransport(cloudBaseUrl()),
    createHttpTransport(deviceBaseUrl()),
    // The one side-effect adapter the client is paired with, so letting go of a
    // cook broadcasts over the websocket as well as writing to the API.
    createSocketEventPort()
  );

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
