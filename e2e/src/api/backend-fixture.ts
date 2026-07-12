/**
 * Typed backend fixture for the e2e suite: seeding + data hygiene.
 *
 * Every entity it seeds is named with the `smoke-test-` prefix (see
 * `test-entity.ts`). Two teardown modes:
 *   - `cleanup()` deletes exactly the entities this run created (tracked by id),
 *     for use in a spec's `afterEach`/`finally`;
 *   - `sweep()` deletes only `smoke-test-*` leftovers from prior crashed runs,
 *     for use once at suite start.
 *
 * All backend I/O goes through an injected `HttpTransport`, which keeps the
 * seed/cleanup/sweep logic unit-testable without a live stack.
 */
import type { HttpTransport } from './http-transport.ts';
import { FetchTransport } from './http-transport.ts';
import { resolveUrls } from '../config/urls.ts';
import { isTestEntityName, selectTestEntities, testEntityName } from './test-entity.ts';

const PRESMOKE_PATH = '/api/presmoke';
const PRESMOKE_ALL_PATH = '/api/presmoke/all';
const SMOKE_PATH = '/api/smoke';
const STATE_PATH = '/api/state';
const NOTIFICATION_SETTINGS_PATH = '/api/notifications/settings';

/** A record the fixture created, retained so `cleanup()` can delete it exactly. */
export interface SeededEntity {
  /** Logical resource type: `presmoke` (delete-by-id) or `smoke` (cascade). */
  resource: 'presmoke' | 'smoke';
  /** Backend document id. */
  id: string;
  /** The prefixed name the entity was created with. */
  name: string;
}

export interface CreatePreSmokeOptions {
  /** Human hint folded into the generated (still prefixed) name. */
  label?: string;
  meatType?: string;
  weightLb?: number;
}

export interface SeedRatings {
  smokeFlavor?: number;
  seasoning?: number;
  tenderness?: number;
  overallTaste?: number;
}

export interface SeedCompletedSmokeOptions extends CreatePreSmokeOptions {
  woodType?: string;
  restTime?: string;
  ratings?: SeedRatings;
}

/** The resolved values a completed smoke was seeded with, for assertions. */
export interface SeededSmoke {
  smokeId: string;
  name: string;
  meatType: string;
  weightLb: number;
  weightUnit: string;
  woodType: string;
  restTime: string;
  ratings: Required<SeedRatings>;
}

interface NamedDoc {
  _id: string;
  name?: string | null;
}

/** A single notification rule as stored in the global settings document. */
interface NotificationRule {
  message?: string | null;
  [key: string]: unknown;
}

/** Shape of `GET /api/smoke/:id` — the sub-entity ids a cascade delete needs. */
interface SmokeDoc {
  _id: string;
  preSmokeId?: string;
  smokeProfileId?: string;
  tempsId?: string;
  postSmokeId?: string;
  ratingId?: string;
}

export class BackendFixture {
  private readonly http: HttpTransport;
  private readonly created: SeededEntity[] = [];
  /** Deferred restore actions (e.g. global config the run mutated in place). */
  private readonly teardowns: Array<() => Promise<void>> = [];

  constructor(http: HttpTransport = new FetchTransport(resolveUrls().backend)) {
    this.http = http;
  }

  /**
   * Seed a pre-smoke. The backend creates the associated smoke and current
   * state as a side effect (the same `POST /api/presmoke` the frontend uses).
   */
  async createPreSmoke(options: CreatePreSmokeOptions = {}): Promise<SeededEntity> {
    const name = testEntityName(options.label ?? 'presmoke');
    const body = {
      name,
      meatType: options.meatType ?? 'Brisket',
      weight: { unit: 'Lb', weight: options.weightLb ?? 10 },
      steps: [''],
      notes: '',
    };
    const doc = await this.http.post<NamedDoc>(PRESMOKE_PATH, body);
    const entity: SeededEntity = { resource: 'presmoke', id: doc._id, name };
    this.created.push(entity);
    return entity;
  }

  /**
   * Seed a fully-populated *completed* smoke straight through the REST API the
   * frontend uses, so the secondary-flow specs (history/review/ratings/delete)
   * have a finished smoke to open without driving the whole live pipeline.
   *
   * Mirrors the real lifecycle order: pre-smoke (creates the smoke + current
   * state) -> smoke profile -> post-smoke -> ratings -> finish (marks Complete,
   * which is what history returns). It then clears the current smoke so the next
   * seed starts fresh. The finished smoke is tracked as a `smoke` entity so
   * `cleanup()` can cascade-delete it, leaving no `smoke-test-*` residue.
   */
  async seedCompletedSmoke(options: SeedCompletedSmokeOptions = {}): Promise<SeededSmoke> {
    const name = testEntityName(options.label ?? 'completed-smoke');
    const resolved: SeededSmoke = {
      smokeId: '',
      name,
      meatType: options.meatType ?? 'Brisket',
      weightLb: options.weightLb ?? 10,
      weightUnit: 'Lb',
      woodType: options.woodType ?? 'Hickory',
      restTime: options.restTime ?? '00:45',
      ratings: {
        smokeFlavor: options.ratings?.smokeFlavor ?? 6,
        seasoning: options.ratings?.seasoning ?? 7,
        tenderness: options.ratings?.tenderness ?? 8,
        overallTaste: options.ratings?.overallTaste ?? 9,
      },
    };

    await this.http.post(PRESMOKE_PATH, {
      name: resolved.name,
      meatType: resolved.meatType,
      weight: { unit: resolved.weightUnit, weight: resolved.weightLb },
      steps: [''],
      notes: '',
    });
    // The pre-smoke POST wires up state.smokeId asynchronously; the current-
    // smoke writes below 404 until it lands, so block on it here.
    await this.waitForCurrentSmoke();

    await this.http.post('/api/smokeProfile/current', {
      chamberName: 'Chamber',
      probe1Name: 'Probe 1',
      probe2Name: 'Probe 2',
      probe3Name: 'Probe 3',
      woodType: resolved.woodType,
      notes: '',
    });
    await this.http.post('/api/postSmoke/current', {
      restTime: resolved.restTime,
      steps: [''],
      notes: '',
    });
    await this.http.post('/api/ratings', { ...resolved.ratings, notes: '' });

    const finished = await this.http.post<NamedDoc>('/api/smoke/finish', {});
    resolved.smokeId = String(finished?._id ?? '');
    this.created.push({ resource: 'smoke', id: resolved.smokeId, name: resolved.name });

    // Leave no active smoke behind, so the next seed opens a fresh lifecycle.
    await this.http.put(`${STATE_PATH}/clearSmoke`);

    return resolved;
  }

  /**
   * Seed a single notification rule so the Settings notifications card has a
   * message field to edit. Notification settings are global singleton config,
   * not a `smoke-test-*` entity, so deployed safety comes from snapshotting the
   * settings that existed before this run and restoring them on `cleanup()`.
   * The seeded message is still prefixed so a UI assertion can identify it.
   * Returns the seeded (prefixed) message.
   */
  async seedNotificationRule(options: { label?: string } = {}): Promise<string> {
    const message = testEntityName(options.label ?? 'notification');
    const prior = await this.http
      .get<{ settings?: unknown[] }>(NOTIFICATION_SETTINGS_PATH)
      .catch(() => null);
    const priorSettings = Array.isArray(prior?.settings) ? prior!.settings : [];
    // Register the restore before mutating, so cleanup always puts it back even
    // if seeding throws partway.
    this.teardowns.push(async () => {
      await this.http.post(NOTIFICATION_SETTINGS_PATH, { settings: priorSettings });
    });
    await this.http.post(NOTIFICATION_SETTINGS_PATH, {
      settings: [{ type: false, message, probe1: 'Chamber', op: '>', probe2: 'Probe 1' }],
    });
    return message;
  }

  /** Poll `GET /api/state` until the pre-smoke's smokeId has been persisted. */
  private async waitForCurrentSmoke(timeoutMs = 15_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const state = await this.http.get<{ smokeId?: string }>(STATE_PATH).catch(() => null);
      if (state?.smokeId) {
        return;
      }
      if (Date.now() >= deadline) {
        throw new Error('Timed out waiting for the current smoke to be set after pre-smoke seed');
      }
      await new Promise(r => setTimeout(r, 250));
    }
  }

  /**
   * Delete exactly the entities this run created, most-recent first, then forget
   * them. Safe to call more than once (a second call is a no-op).
   */
  async cleanup(): Promise<void> {
    const toDelete = this.created.splice(0).reverse();
    for (const entity of toDelete) {
      // Best-effort: a spec may already have deleted its own record (e.g. the
      // delete journey), so a 404 here is expected and must not fail teardown.
      try {
        if (entity.resource === 'smoke') {
          await this.deleteCompletedSmoke(entity.id);
        } else {
          await this.http.delete(`${PRESMOKE_PATH}/${entity.id}`);
        }
      } catch {
        /* already gone — nothing to reclaim */
      }
    }
    // Run deferred restores (most-recent first) after entity deletions.
    const restores = this.teardowns.splice(0).reverse();
    for (const restore of restores) {
      try {
        await restore();
      } catch {
        /* best-effort restore */
      }
    }
  }

  /**
   * Delete a completed smoke and every record it links, mirroring the frontend's
   * own delete flow (`deleteSmokeService`): read the smoke to discover its
   * sub-entities, delete each, then the smoke itself. This is what guarantees a
   * seeded completed smoke leaves no `smoke-test-*` residue behind.
   */
  private async deleteCompletedSmoke(smokeId: string): Promise<void> {
    if (!smokeId) {
      return;
    }
    const smoke = await this.http.get<SmokeDoc>(`${SMOKE_PATH}/${smokeId}`).catch(() => null);
    if (smoke) {
      const links: Array<[string | undefined, string]> = [
        [smoke.preSmokeId, PRESMOKE_PATH],
        [smoke.smokeProfileId, '/api/smokeProfile'],
        [smoke.tempsId, '/api/temps'],
        [smoke.postSmokeId, '/api/postSmoke'],
        [smoke.ratingId, '/api/ratings'],
      ];
      for (const [id, path] of links) {
        if (id) {
          await this.http.delete(`${path}/${id}`);
        }
      }
    }
    await this.http.delete(`${SMOKE_PATH}/${smokeId}`);
  }

  /**
   * Delete `smoke-test-*` leftovers from prior crashed runs. Lists every
   * pre-smoke, keeps only the prefixed ones (real data can never match — see
   * `selectTestEntities`), and deletes those. Intended to run once before the
   * suite so a previous crash cannot leak state into a fresh run.
   */
  async sweep(): Promise<void> {
    const all = await this.http.get<NamedDoc[]>(PRESMOKE_ALL_PATH);
    const leftovers = selectTestEntities(all, doc => doc.name);
    for (const doc of leftovers) {
      await this.http.delete(`${PRESMOKE_PATH}/${doc._id}`);
    }
    await this.clearDanglingCurrentSmoke();
    await this.sweepNotificationSettings();
  }

  /**
   * Heal a poisoned current smoke. When a crashed run's `smoke-test-*`
   * pre-smoke is deleted (by its own `cleanup()` or by the sweep above) while
   * it is still the *current* smoke, the state keeps an in-progress smoke whose
   * `preSmokeId` points at a deleted document — and from then on every
   * `POST /api/presmoke` 404s on the stale reference, so no journey can start.
   * Detect exactly that shape, cascade-delete the orphaned smoke, and clear the
   * state. A real in-progress smoke still has its pre-smoke document, so it is
   * never touched.
   */
  private async clearDanglingCurrentSmoke(): Promise<void> {
    const state = await this.http.get<{ smokeId?: string }>(STATE_PATH).catch(() => null);
    if (!state?.smokeId) {
      return;
    }
    const smoke = await this.http
      .get<SmokeDoc>(`${SMOKE_PATH}/${state.smokeId}`)
      .catch(() => null);
    if (!smoke?.preSmokeId) {
      return;
    }
    const pre = await this.http
      .get<NamedDoc>(`${PRESMOKE_PATH}/${smoke.preSmokeId}`)
      .catch(() => null);
    if (pre?._id) {
      return;
    }
    try {
      await this.deleteCompletedSmoke(state.smokeId);
    } catch {
      /* best-effort — clearing the state below is what unblocks pre-smoke saves */
    }
    await this.http.put(`${STATE_PATH}/clearSmoke`);
  }

  /**
   * Notification settings are global config a crashed settings-spec run can
   * leave a `smoke-test-*` rule in. There is no per-rule delete endpoint, so
   * re-POST the settings with the prefixed rules filtered out — but only when
   * one is actually present, to avoid needlessly rewriting real config.
   */
  private async sweepNotificationSettings(): Promise<void> {
    const current = await this.http
      .get<{ settings?: NotificationRule[] }>(NOTIFICATION_SETTINGS_PATH)
      .catch(() => null);
    const rules = Array.isArray(current?.settings) ? current!.settings : [];
    const kept = rules.filter(rule => !isTestEntityName(rule?.message));
    if (kept.length !== rules.length) {
      await this.http.post(NOTIFICATION_SETTINGS_PATH, { settings: kept });
    }
  }
}
