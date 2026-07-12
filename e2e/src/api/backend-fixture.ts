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
import { selectTestEntities, testEntityName } from './test-entity.ts';

const PRESMOKE_PATH = '/api/presmoke';
const PRESMOKE_ALL_PATH = '/api/presmoke/all';

/** A record the fixture created, retained so `cleanup()` can delete it exactly. */
export interface SeededEntity {
  /** Logical resource type, e.g. `presmoke`. */
  resource: string;
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

interface NamedDoc {
  _id: string;
  name?: string | null;
}

export class BackendFixture {
  private readonly http: HttpTransport;
  private readonly created: SeededEntity[] = [];

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
   * Delete exactly the entities this run created, most-recent first, then forget
   * them. Safe to call more than once (a second call is a no-op).
   */
  async cleanup(): Promise<void> {
    const toDelete = this.created.splice(0).reverse();
    for (const entity of toDelete) {
      await this.http.delete(`${PRESMOKE_PATH}/${entity.id}`);
    }
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
  }
}
