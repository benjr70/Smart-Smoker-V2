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

  /**
   * Number of temperature records persisted for the current smoke.
   *
   * `GET /api/temps` returns the current smoke's temps, which is exactly the
   * series the relay writes as the emulator streams. The temp-chain spec uses
   * this as a storage-level persistence check that survives a frontend reload:
   * the records live in the backend, not just the browser chart.
   */
  async getCurrentTempCount(): Promise<number> {
    const res = await fetch(`${this.base}/api/temps`);
    if (!res.ok) {
      throw new Error(`Failed to read current temps (${res.status}): ${await res.text()}`);
    }
    const temps = (await res.json()) as unknown[];
    return Array.isArray(temps) ? temps.length : 0;
  }

  /**
   * Poll `GET /api/temps` until at least one record is persisted for the current
   * smoke, returning the observed count.
   *
   * The backend throttles its persist path — it writes roughly one temp record
   * per handful of streamed frames while smoking — so the first DB write lands a
   * few seconds after smoking is toggled on (≈5.5s at the 500ms emulator
   * cadence). A single immediate read races that throttle window and sees `[]`.
   * This waits across several windows before giving up so the persistence check
   * is deterministic rather than timing-dependent.
   */
  async waitForPersistedTemps(timeoutMs = 30000, intervalMs = 500): Promise<number> {
    const deadline = Date.now() + timeoutMs;
    let count = await this.getCurrentTempCount();
    while (count === 0 && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, intervalMs));
      count = await this.getCurrentTempCount();
    }
    return count;
  }
}
