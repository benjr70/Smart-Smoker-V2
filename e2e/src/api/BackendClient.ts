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
    const res = await fetch(`${this.base}/api/presmoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`Failed to seed pre-smoke (${res.status}): ${await res.text()}`);
    }
  }
}
