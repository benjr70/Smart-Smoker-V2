import { resolveUrls } from '../config/urls';

/**
 * Thin backend REST client for test setup.
 *
 * This slice uses it only to seed a pre-smoke with a correctly-typed payload —
 * the same `POST /api/presmoke` endpoint the frontend uses. Seeding through the
 * API (rather than the pre-smoke wizard UI) keeps the tracer bullet focused on
 * the live temperature pipeline and the interactive lifecycle steps, and lets
 * the app source stay behaviour-free (test-id attributes only).
 *
 * Later slices grow this into the full fixture (seed / cleanup / sweep).
 */
export interface SeedPreSmoke {
  name: string;
  meatType?: string;
  weightLb?: number;
}

/** Ratings a seeded smoke is finished with (0-10 each, matching the UI). */
export interface SeedRatings {
  smokeFlavor?: number;
  seasoning?: number;
  tenderness?: number;
  overallTaste?: number;
}

export interface SeedCompletedSmoke {
  name: string;
  meatType?: string;
  weightLb?: number;
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

export class BackendClient {
  private readonly base: string;

  constructor(baseUrl: string = resolveUrls().backend) {
    this.base = baseUrl.replace(/\/+$/, '');
  }

  /**
   * Create a pre-smoke. The backend creates the associated smoke and populates
   * the current state's smokeId as a side effect, which is what lets the smoker
   * UI later toggle smoking.
   */
  async createPreSmoke(seed: SeedPreSmoke): Promise<void> {
    const body = {
      name: seed.name,
      meatType: seed.meatType ?? 'Brisket',
      weight: { unit: 'Lb', weight: seed.weightLb ?? 10 },
      steps: [''],
      notes: '',
    };
    await this.post('/api/presmoke', body);
  }

  /**
   * Seed a fully-populated completed smoke straight through the REST API the
   * frontend uses, so the secondary-flow specs (history/review/ratings/delete)
   * have a finished smoke to open without driving the whole live pipeline.
   *
   * Mirrors the real lifecycle order: pre-smoke (creates the smoke + current
   * state) -> smoke profile -> post-smoke -> ratings -> finish (marks Complete,
   * which is what `GET /api/history` returns). It then clears the current smoke
   * so the next seed starts from a clean state rather than re-editing this one.
   */
  async seedCompletedSmoke(seed: SeedCompletedSmoke): Promise<SeededSmoke> {
    const resolved: SeededSmoke = {
      smokeId: '',
      name: seed.name,
      meatType: seed.meatType ?? 'Brisket',
      weightLb: seed.weightLb ?? 10,
      weightUnit: 'Lb',
      woodType: seed.woodType ?? 'Hickory',
      restTime: seed.restTime ?? '00:45',
      ratings: {
        smokeFlavor: seed.ratings?.smokeFlavor ?? 6,
        seasoning: seed.ratings?.seasoning ?? 7,
        tenderness: seed.ratings?.tenderness ?? 8,
        overallTaste: seed.ratings?.overallTaste ?? 9,
      },
    };

    await this.createPreSmoke({
      name: resolved.name,
      meatType: resolved.meatType,
      weightLb: resolved.weightLb,
    });
    // The pre-smoke POST wires up `state.smokeId` asynchronously; the current-
    // smoke writes below 404 until it lands, so block on it here.
    await this.waitForCurrentSmoke();

    await this.post('/api/smokeProfile/current', {
      chamberName: 'Chamber',
      probe1Name: 'Probe 1',
      probe2Name: 'Probe 2',
      probe3Name: 'Probe 3',
      woodType: resolved.woodType,
      notes: '',
    });
    await this.post('/api/postSmoke/current', {
      restTime: resolved.restTime,
      steps: [''],
      notes: '',
    });
    await this.post('/api/ratings', { ...resolved.ratings, notes: '' });

    const finished = await this.post('/api/smoke/finish', {});
    resolved.smokeId = String(finished?._id ?? '');

    // Leave no active smoke behind, so the next seed opens a fresh lifecycle
    // instead of overwriting this now-completed one.
    await this.put('/api/state/clearSmoke');

    return resolved;
  }

  /**
   * Seed a single notification rule so the Settings notifications card has a
   * message field to edit. On an empty database `GET /api/notifications/settings`
   * returns no rules and the card renders none; this establishes the baseline
   * the settings-persistence spec then changes. Returns the seeded message.
   */
  async seedNotificationRule(message: string): Promise<string> {
    await this.post('/api/notifications/settings', {
      settings: [{ type: false, message, probe1: 'Chamber', op: '>', probe2: 'Probe 1' }],
    });
    return message;
  }

  /** Poll `GET /api/state` until the pre-smoke's smokeId has been persisted. */
  private async waitForCurrentSmoke(timeoutMs = 15_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const res = await fetch(`${this.base}/api/state`);
      if (res.ok) {
        const state = await res.json().catch(() => null);
        if (state?.smokeId) {
          return;
        }
      }
      await new Promise(r => setTimeout(r, 250));
    }
    throw new Error('Timed out waiting for the current smoke to be set after pre-smoke seed');
  }

  private async post(path: string, body: unknown): Promise<any> {
    const res = await fetch(`${this.base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`POST ${path} failed (${res.status}): ${await res.text()}`);
    }
    return res.json().catch(() => null);
  }

  private async put(path: string): Promise<any> {
    const res = await fetch(`${this.base}${path}`, { method: 'PUT' });
    if (!res.ok) {
      throw new Error(`PUT ${path} failed (${res.status}): ${await res.text()}`);
    }
    return res.json().catch(() => null);
  }
}
