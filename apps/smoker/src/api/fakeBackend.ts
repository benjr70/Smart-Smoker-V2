/**
 * In-memory fake backend for the smoker's two backends.
 *
 * A seeded record store plus a route table mirroring the cloud API and the
 * local device service, mounted on the shared fake-backend kernel (which
 * records requests, injects faults and 404s unrouted paths). Tests seed it, run
 * real client code, and assert on the store and the recorded requests
 * afterward — no axios mocking.
 *
 * The smoker uses one instance per base URL: a cloud instance handles the
 * `state`/`smokeProfile`/`temps` routes and a device instance handles the
 * `api/wifiManager` routes, so a test can prove a call landed on the correct
 * host by inspecting which instance recorded it.
 */
import {
  FakeBackendKernel,
  FakeRequest,
  NO_ROUTE,
  clone,
  createFakeBackendKernel,
} from 'api-transport/src';
import { WireCookEvent } from './cookEventFrames';
import { CookStamp } from './cookStamps';
import { AppearancePreference, ProbeTargetSetting, State, TempData } from './types';

/**
 * A profile as it may sit persisted on the backend: the optional `notes`/
 * `woodType` may be absent and Mongo's `_id`/`__v` may ride along. Seeded by
 * tests to exercise read-path normalization; an absent current profile is
 * seeded as `undefined` so the client maps it to `null`.
 */
export type StoredSmokeProfile = {
  chamberName?: string;
  probe1Name?: string;
  probe2Name?: string;
  probe3Name?: string;
  notes?: string;
  woodType?: string;
  _id?: string;
  __v?: number;
};

/**
 * The Probe Target Reached block as the backend actually serves it: each row
 * also carries where its temperature came from, and the name resolved from the
 * cook that is set up now. The touchscreen reads neither, so seeding them is
 * what proves it is not quietly passing them on.
 */
export type StoredProbeTargets = {
  enabled: boolean;
  probes: (ProbeTargetSetting & { targetSource?: string; name?: string })[];
};

export interface FakeBackendSeed {
  /**
   * The persisted state document. Seed `null` to model a backend with no state:
   * `GET state` resolves `undefined` on a fresh or reset database and
   * `PUT state/toggleSmoking` returns an explicit `null` when there is no
   * current smoke. Nest serializes both as an EMPTY body, which the smoker's
   * transport hands back verbatim as `''` (it does not opt into the
   * empty-body-to-null mapping).
   */
  state?: State | null;
  smokeProfile?: {
    current?: StoredSmokeProfile;
  };
  temps?: {
    current?: TempData[];
    batches?: TempData[][];
  };
  wifi?: {
    connection?: unknown;
    connectResult?: unknown;
  };
  /**
   * The stored application settings document. An absent `appearance` models an
   * installation nobody has chosen one on — and a deployment older than the
   * block — which the client reads as the documented default.
   */
  appSettings?: {
    appearance?: AppearancePreference;
    /**
     * The Probe Target Reached rows, as they are stored: by slot, with the
     * temperature each probe's meat is done at. Absent models an installation
     * nobody has configured any targets on.
     */
    probeTarget?: StoredProbeTargets;
    /**
     * The cook-log stamps as they are stored. Absent models an installation
     * nobody has edited the catalogue on — and a deployment older than the
     * block — which the client reads as the shipped six.
     */
    cookLog?: { stamps?: CookStamp[] };
  };
  /**
   * The cook in progress's log, as the wire carries it: moments are ISO
   * strings, and a temperature the pit never reported is simply absent.
   */
  cookEvents?: WireCookEvent[];
  /**
   * Each smoke's timing document, keyed by smoke id, with the stamps as the
   * ISO strings JSON carries them in. An id with no entry models a backend
   * without the timeline route (404), which is what the kernel answers for an
   * unrouted read.
   *
   * The running cook is one of those keys — `current` — because that is what it
   * is on the backend too: a route beside the by-id ones, declared ahead of them
   * so `current` is never taken for an id. It is the only entry that carries an
   * estimate, and an entry without one models a deployment older than it.
   */
  timeline?: Record<string, StoredTimeline>;
}

/**
 * A cook's timing as the wire carries it: stamps are ISO strings or null, and
 * the estimated completion — served for the running cook only — is one more of
 * them.
 */
export type StoredTimeline = {
  startedAt: string | null;
  finishedAt: string | null;
  estimate?: {
    state: 'warming' | 'ok' | 'stalled' | 'paused' | 'done' | null;
    eta: string | null;
    /** How long is left, as the backend serves it — absent where it cannot say. */
    hoursRemaining?: number | null;
  };
  /**
   * The Serve Plan of the running cook, as the backend serves it — absent for a
   * cook nobody planned, for an installation with the planner switched off, and
   * for a deployment older than the planner, which are one absence on the wire.
   */
  servePlan?: {
    serveAt: string | null;
    pullBy: string | null;
    restMinutes: number | null;
    slackMinutes: number | null;
    verdict: 'early' | 'ontrack' | 'behind' | 'unknown';
  };
  /** When the meat came off, once the backend has stamped it. */
  pullAt?: string | null;
};

/** What the transport yields for an empty-body 200 (axios surfaces `''`). */
const EMPTY_BODY = '';

interface FakeStore {
  state: State | null;
  /** The smoke id each `smoke/finish` archived, in order. */
  finished: string[];
  /** The last pre-smoke saved — what created the session now current. */
  preSmoke: unknown;
  /**
   * The smoke a pre-smoke save created that the state has not been pointed at
   * yet, or `null` when the state is up to date.
   *
   * The backend answers a pre-smoke save before the smoke it creates has been
   * linked to the state — `PreSmokeService.startSmokeWith` does not await that
   * write — so a caller that reads the state on the strength of the save alone
   * can find it still empty. The fake keeps the link one read behind for the
   * same reason: a panel that lights a cook without waiting for it should fail
   * here the way it fails in a garage.
   */
  pendingSmokeId: string | null;
  smokeProfile: {
    current: StoredSmokeProfile | undefined;
  };
  temps: {
    current: TempData[];
    batches: TempData[][];
  };
  wifi: {
    connection: unknown;
    connectResult: unknown;
  };
  appSettings: {
    appearance?: AppearancePreference;
    probeTarget?: StoredProbeTargets;
    cookLog?: { stamps?: CookStamp[] };
  };
  timeline: Record<string, StoredTimeline>;
  /** The cook log, in the order it was recorded. */
  cookEvents: WireCookEvent[];
}

export type FakeBackend = FakeBackendKernel<FakeStore>;

export const createFakeBackend = (seed: FakeBackendSeed = {}): FakeBackend => {
  const store: FakeStore = {
    state: seed.state === undefined ? { smokeId: '', smoking: false } : seed.state,
    finished: [],
    preSmoke: undefined,
    pendingSmokeId: null,
    smokeProfile: {
      current: seed.smokeProfile?.current,
    },
    temps: {
      current: seed.temps?.current ?? [],
      batches: seed.temps?.batches ?? [],
    },
    wifi: {
      connection: seed.wifi?.connection ?? [],
      connectResult: seed.wifi?.connectResult ?? { success: true },
    },
    appSettings: {
      appearance: seed.appSettings?.appearance,
      probeTarget: seed.appSettings?.probeTarget,
      cookLog: seed.appSettings?.cookLog,
    },
    timeline: seed.timeline ?? {},
    cookEvents: seed.cookEvents ?? [],
  };
  const route = ({ method, path, body }: FakeRequest): unknown => {
    // Cloud API routes.
    if (path === 'state' && method === 'get') {
      const answer = store.state === null ? EMPTY_BODY : clone(store.state);
      if (store.pendingSmokeId !== null) {
        // The link a pre-smoke save set going lands *after* this read has been
        // answered, so the first look still shows no cook and the one after it
        // shows the session that was created.
        store.state = { smokeId: store.pendingSmokeId, smoking: false };
        store.pendingSmokeId = null;
      }
      return answer;
    }
    if (path === 'state/toggleSmoking' && method === 'put') {
      // With no state (or no smokeId) the backend toggles nothing and returns
      // null, which reaches the transport as an empty body.
      if (store.state === null) {
        return EMPTY_BODY;
      }
      store.state = { ...store.state, smoking: !store.state.smoking };
      return clone(store.state);
    }
    if (path === 'state/clearSmoke' && method === 'put') {
      store.state = { smokeId: '', smoking: false };
      store.pendingSmokeId = null;
      return clone(store.state);
    }
    if (path === 'smoke/finish' && method === 'post') {
      // The route archives the cook the state points at; the stamps it carries
      // are the backend's own and are not touched by the call.
      store.finished.push(store.state?.smokeId ?? '');
      return {};
    }
    if (path === 'presmoke' && method === 'post') {
      store.preSmoke = clone(body);
      // Saving a pre-smoke with nothing current is what creates the next
      // session on the backend, which is the whole reason this route is the one
      // the panel calls.
      if (!store.state?.smokeId) {
        store.pendingSmokeId = 'smoke-next';
      }
      return clone(store.preSmoke);
    }
    if (path === 'smokeProfile/current' && method === 'get') {
      // An unsaved profile is represented as null on the wire, never undefined.
      return store.smokeProfile.current === undefined ? null : clone(store.smokeProfile.current);
    }
    if (path === 'smokeProfile/current' && method === 'post') {
      store.smokeProfile.current = clone(body) as StoredSmokeProfile;
      return clone(store.smokeProfile.current);
    }
    if (path === 'temps' && method === 'get') {
      return clone(store.temps.current);
    }
    if (path === 'temps/batch' && method === 'post') {
      const batch = clone(body) as TempData[];
      store.temps.batches.push(batch);
      return { success: true, count: batch.length };
    }

    // A cook's timing, by smoke id. Unseeded ids fall through to the kernel's
    // 404, modelling a backend without the timeline module.
    const timelineMatch = /^timeline\/(.+)$/.exec(path);
    if (timelineMatch && method === 'get') {
      const stored = store.timeline[timelineMatch[1]];
      return stored === undefined ? NO_ROUTE : clone(stored);
    }

    // The cook log of the cook in progress. The panel may read it and add to
    // it; there is no delete route here because the touchscreen has no delete.
    if (path === 'cook-events/current' && method === 'get') {
      return clone(store.cookEvents);
    }
    if (path === 'cook-events' && method === 'post') {
      const { stampKey } = (body ?? {}) as { stampKey?: string };
      // The backend stamps the moment and the readings, which is exactly why
      // the panel posts the key alone and renders what comes back.
      const recorded: WireCookEvent = {
        _id: `event-${store.cookEvents.length + 1}`,
        smokeId: store.state?.smokeId ?? '',
        stampKey: stampKey ?? '',
        label: stampKey ?? '',
        tone: 'amber',
        at: new Date().toISOString(),
        chamberTemp: 225,
      };
      store.cookEvents.push(recorded);
      return clone(recorded);
    }

    // The settings document, of which the device reads the appearance, the
    // configured targets and the stamp catalogue — and only ever reads them.
    if (path === 'appSettings' && method === 'get') {
      return clone(store.appSettings);
    }

    // Device-service routes.
    if (path === 'api/wifiManager/connect' && method === 'post') {
      return clone(store.wifi.connectResult);
    }
    if (path === 'api/wifiManager/connection' && method === 'get') {
      return clone(store.wifi.connection);
    }

    return NO_ROUTE;
  };

  return createFakeBackendKernel({ store, route });
};
