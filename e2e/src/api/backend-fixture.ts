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
 * Both end by healing a *dangling current smoke* — the state a crashed run
 * leaves pointing at a pre-smoke it deleted, which 404s every later
 * `POST /api/presmoke`. Both seeds that make that call — `createPreSmoke()` and
 * `seedCompletedSmoke()` — heal it inline as well, so a run that walks into the
 * poison recovers instead of failing at fixture setup.
 *
 * All backend I/O goes through an injected `HttpTransport`, which keeps the
 * seed/cleanup/sweep logic unit-testable without a live stack.
 */
import type { HttpTransport } from './http-transport.ts';
import { FetchTransport } from './http-transport.ts';
import { resolveUrls } from '../config/urls.ts';
import {
  TEST_ENTITY_PREFIX,
  isTestEntityName,
  selectTestEntities,
  testEntityName,
} from './test-entity.ts';

const PRESMOKE_PATH = '/api/presmoke';
const PRESMOKE_ALL_PATH = '/api/presmoke/all';
const SMOKE_PATH = '/api/smoke';
const STATE_PATH = '/api/state';
const TEMPS_PATH = '/api/temps';
const NOTIFICATION_SETTINGS_PATH = '/api/notifications/settings';

/**
 * The one failure a pre-smoke save is allowed to heal and retry: the 404 the
 * backend answers with while the *current* smoke references a pre-smoke
 * document that no longer exists (`PreSmoke <id> not found`). Any other 404 is
 * somebody else's bug and must reach the report intact.
 */
const STALE_PRESMOKE_REFERENCE = /\(404\)[\s\S]*PreSmoke\s+\S+\s+not found/i;

/**
 * A transport failure the backend itself answered with `404 Not Found` — the
 * only failure that proves a document is gone rather than merely unreadable.
 * `FetchTransport` puts the status in the message it throws; a 5xx, a proxy
 * timeout or a dropped connection carries no status at all, and none of them
 * may be read as proof of anything.
 */
const NOT_FOUND_RESPONSE = /\bfailed \(404\)/;

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

/** The ids `adoptCurrentSmoke()` resolved for the smoke the UI created. */
export interface AdoptedSmoke {
  /** The in-progress smoke the pre-smoke save opened. */
  smokeId: string;
  /** The pre-smoke document the wizard wrote. */
  preSmokeId: string;
  /** The (prefixed) name the wizard was driven with. */
  name: string;
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
    const doc = await this.savePreSmoke(body);
    const entity: SeededEntity = { resource: 'presmoke', id: doc._id, name };
    this.created.push(entity);
    return entity;
  }

  /**
   * Save the pre-smoke, healing a poisoned current smoke if that is what the
   * save failed on. A crashed run can leave the state pointing at a smoke whose
   * pre-smoke was deleted, and from then on every `POST /api/presmoke` 404s on
   * the stale reference — including this run's own retries. So a failed save
   * heals *once* and retries *once*.
   */
  private async savePreSmoke(body: Record<string, unknown>): Promise<NamedDoc> {
    try {
      return await this.http.post<NamedDoc>(PRESMOKE_PATH, body);
    } catch (error) {
      if (!STALE_PRESMOKE_REFERENCE.test(error instanceof Error ? error.message : String(error))) {
        throw error;
      }
      const healed = await this.clearDanglingCurrentSmoke().catch(() => false);
      if (!healed) {
        throw error;
      }
      try {
        return await this.http.post<NamedDoc>(PRESMOKE_PATH, body);
      } catch {
        // The heal was a hypothesis and it was wrong: report the failure the
        // run actually started with rather than the retry's echo of it, and
        // stop here — one heal, one retry, never a loop.
        throw error;
      }
    }
  }

  /**
   * Adopt the smoke a *journey* just created through the wizard UI.
   *
   * A UI-created pre-smoke has no id the fixture could record at creation time,
   * so without this the run's records would only be reclaimable by the prefix
   * `sweep()` — which runs at suite start, not at the end of the spec that made
   * the mess. Adopt closes that gap: it resolves the current smoke and its
   * pre-smoke through the same API the frontend uses, and registers the smoke
   * for the exact-delete cascade in `cleanup()`. The prefix sweep stays as the
   * crash safety net for runs that die before their teardown.
   *
   * Three failures, none of which tracks the smoke for deletion, and each of
   * which reads as itself rather than as one of the others:
   *   - no current smoke exists (the UI save never landed) — a clear error
   *     rather than a silently empty cleanup;
   *   - the current pre-smoke's name is not `smoke-test-*` — the fixture must
   *     never be able to delete a real cook, so an unprefixed record is never
   *     adopted (this is the same guarantee `sweep()` gets from the prefix);
   *   - a lookup could not be read at all — see `resolveForAdopt`. Deletion
   *     still needs the prefix proof it never got, but the state clear is
   *     registered anyway so the unverified smoke does not stay *current* and
   *     poison every spec that follows.
   *
   * The adopted smoke is still the *current* one, so cleanup also clears the
   * state: deleting a current smoke without clearing it leaves a stale
   * `preSmokeId` that 404s every later pre-smoke save.
   */
  async adoptCurrentSmoke(
    options: { timeoutMs?: number; lookupTimeoutMs?: number } = {}
  ): Promise<AdoptedSmoke> {
    const smokeId = await this.waitForCurrentSmoke('the UI-created pre-smoke', options.timeoutMs);
    const lookupTimeoutMs = options.lookupTimeoutMs ?? 5_000;
    const smoke = await this.resolveForAdopt<SmokeDoc>(
      `${SMOKE_PATH}/${smokeId}`,
      smokeId,
      lookupTimeoutMs
    );
    const preSmokeId = smoke?.preSmokeId ?? '';
    if (!preSmokeId) {
      throw this.unverifiableAdopt(
        smokeId,
        'it links no pre-smoke, so there is no name to check the prefix against'
      );
    }
    const pre = await this.resolveForAdopt<NamedDoc>(
      `${PRESMOKE_PATH}/${preSmokeId}`,
      smokeId,
      lookupTimeoutMs
    );
    const name = pre?.name ?? '';
    if (!isTestEntityName(name)) {
      throw new Error(
        `Refusing to adopt current smoke ${smokeId}: its pre-smoke name ${JSON.stringify(name)} ` +
          `does not carry the ${TEST_ENTITY_PREFIX} prefix, so it may not be deleted by cleanup()`
      );
    }
    this.created.push({ resource: 'smoke', id: smokeId, name });
    this.registerClearSmoke();
    return { smokeId, preSmokeId, name };
  }

  /**
   * Read one of the documents adopt's safety decision depends on.
   *
   * A read that fails must never collapse into the "not a `smoke-test-` entity"
   * refusal: that message sends whoever reads the CI failure hunting a naming
   * bug when the real cause was the transport. So a failure is retried for a
   * short window first (a blip under Playwright load is ordinary), and if it
   * stays broken it surfaces as its own diagnosis, carrying the path and the
   * underlying error.
   */
  private async resolveForAdopt<T>(path: string, smokeId: string, timeoutMs: number): Promise<T> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      try {
        return await this.http.get<T>(path);
      } catch (error) {
        if (Date.now() >= deadline) {
          throw this.unverifiableAdopt(
            smokeId,
            `GET ${path} failed (${error instanceof Error ? error.message : String(error)})`
          );
        }
      }
      await new Promise(r => setTimeout(r, 250));
    }
  }

  /**
   * Fail an adopt that could not prove what it was looking at. The smoke stays
   * untracked — deleting without the prefix proof is exactly what the fixture
   * may never do — but the state clear is registered first, because leaving an
   * unverified smoke *current* makes every later spec's pre-smoke save update
   * this smoke instead of opening its own.
   */
  private unverifiableAdopt(smokeId: string, detail: string): Error {
    this.registerClearSmoke();
    return new Error(
      `Could not adopt current smoke ${smokeId}: ${detail}. Nothing was tracked for deletion; ` +
        `cleanup() will clear the current smoke and the ${TEST_ENTITY_PREFIX} sweep reclaims the rest`
    );
  }

  /** Defer the current-smoke state clear to `cleanup()`. */
  private registerClearSmoke(): void {
    this.teardowns.push(async () => {
      await this.http.put(`${STATE_PATH}/clearSmoke`);
    });
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

    // Through `savePreSmoke`, not the transport directly: this is the fixture
    // setup most specs open with, so it is the path a crashed run's poison is
    // likeliest to hit — and here there is no earlier `cleanup()` to have
    // healed it.
    await this.savePreSmoke({
      name: resolved.name,
      meatType: resolved.meatType,
      weight: { unit: resolved.weightUnit, weight: resolved.weightLb },
      steps: [''],
      notes: '',
    });
    // The pre-smoke POST wires up state.smokeId asynchronously; the current-
    // smoke writes below 404 until it lands, so block on it here.
    await this.waitForCurrentSmoke('the pre-smoke seed');

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

  /**
   * Poll `GET /api/state` until a pre-smoke save has persisted its smokeId, and
   * answer with it. `source` names what the caller was waiting on so a timeout
   * reads as a diagnosis rather than a bare stall.
   */
  private async waitForCurrentSmoke(source: string, timeoutMs = 15_000): Promise<string> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const state = await this.http.get<{ smokeId?: string }>(STATE_PATH).catch(() => null);
      if (state?.smokeId) {
        return state.smokeId;
      }
      if (Date.now() >= deadline) {
        throw new Error(`There is no current smoke: none was set by ${source}`);
      }
      await new Promise(r => setTimeout(r, 250));
    }
  }

  /**
   * Wait until the backend has stored at least `minimum` readings of the current
   * cook, and answer with how many it holds.
   *
   * A cook is visibly live on every screen long before any of it is *stored*:
   * the smoker relays a frame twice a second, but the backend persists only
   * every eleventh one, so the first seconds of a smoke exist solely in the open
   * pages' memory. Any proof that reads the cook back from the backend — a
   * reload, above all — therefore has to wait for that write, or it races the
   * persistence and fails against an empty chart.
   *
   * Times out naming what was actually stored, so a stall reads as "the cook
   * never reached the backend" rather than as an anonymous wait.
   */
  async waitForStoredTemps(minimum = 1, timeoutMs = 30_000): Promise<number> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const temps = await this.http.get<unknown[]>(TEMPS_PATH).catch(() => null);
      const stored = Array.isArray(temps) ? temps.length : 0;
      if (stored >= minimum) {
        return stored;
      }
      if (Date.now() >= deadline) {
        throw new Error(
          `The backend stored ${stored} of the ${minimum} reading(s) the cook needed: ` +
            `no smoke is running, or nothing is relaying temperatures to it`
        );
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
    // Heal on the way out as well as on the way in: the deletions above are
    // themselves what can leave the state pointing at a smoke whose pre-smoke
    // is gone, and a run that hands that on fails the *next* run at fixture
    // setup — a false negative that reads as a product bug.
    try {
      await this.clearDanglingCurrentSmoke();
    } catch {
      /* best-effort heal — the suite-start sweep is the remaining safety net */
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
   * never touched — and neither is one whose documents merely could not be read
   * (see `isPreSmokeGone`): every step here fails *closed*, because the cascade
   * it authorizes has no `smoke-test-` prefix to fall back on.
   *
   * Answers whether it healed anything, so a caller can tell "the poison is
   * gone, worth another go" from "this failure was something else".
   */
  async clearDanglingCurrentSmoke(): Promise<boolean> {
    const state = await this.http.get<{ smokeId?: string }>(STATE_PATH).catch(() => null);
    if (!state?.smokeId) {
      return false;
    }
    const smoke = await this.http.get<SmokeDoc>(`${SMOKE_PATH}/${state.smokeId}`).catch(() => null);
    if (!smoke?.preSmokeId) {
      return false;
    }
    if (!(await this.isPreSmokeGone(smoke.preSmokeId))) {
      return false;
    }
    try {
      await this.deleteCompletedSmoke(state.smokeId);
    } catch {
      /* best-effort — clearing the state below is what unblocks pre-smoke saves */
    }
    await this.http.put(`${STATE_PATH}/clearSmoke`);
    return true;
  }

  /**
   * Answer whether the pre-smoke a current smoke links is *provably* gone —
   * the one fact that authorizes the destructive heal above.
   *
   * Proof is only what the backend answered for itself: a `404` (its
   * `getByIdOrThrow` for a document that no longer exists), or a success that
   * carries no document. Every other failure — a 502 from the tunnel, a
   * timeout under Playwright load, a dropped connection — says nothing about
   * whether the document exists, and the deployed projects run against a shared
   * dev-cloud where somebody's real cook may be the current smoke. So anything
   * ambiguous is answered "not gone": the heal is skipped, the cook survives,
   * and the worst case is the run failing on the poison it could not confirm
   * instead of deleting records it could not account for.
   */
  private async isPreSmokeGone(preSmokeId: string): Promise<boolean> {
    try {
      const pre = await this.http.get<NamedDoc | null>(`${PRESMOKE_PATH}/${preSmokeId}`);
      return !pre?._id;
    } catch (error) {
      return NOT_FOUND_RESPONSE.test(error instanceof Error ? error.message : String(error));
    }
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
