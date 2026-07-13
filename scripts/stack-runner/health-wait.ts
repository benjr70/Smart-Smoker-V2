/**
 * Bounded readiness poll for a hermetic stack.
 *
 * The compose healthchecks gate container start ordering; this gates `up`'s
 * return so the CLI only prints URLs once the browser-reachable endpoints
 * actually answer. Mirrors the e2e suite's wait-for-healthy but keyed off the
 * per-PR host ports. fetch + timing are injectable for tests.
 */
import type { StackConfig } from './stack-config.ts';

export interface HealthTarget {
  name: string;
  url: string;
  /** Status codes that count as healthy (defaults to 200). */
  expect?: number[];
}

export interface WaitOptions {
  timeoutMs?: number;
  intervalMs?: number;
  fetchImpl?: typeof fetch;
  log?: (msg: string) => void;
}

/** Health endpoints for a stack's allocated ports. */
export function healthTargets(config: StackConfig): HealthTarget[] {
  const { ports } = config;
  return [
    { name: 'backend', url: `http://localhost:${ports.backend}/api/health` },
    { name: 'device-service', url: `http://localhost:${ports.device}/api/health` },
    { name: 'frontend', url: `http://localhost:${ports.frontend}/` },
    { name: 'smoker', url: `http://localhost:${ports.smoker}/` },
  ];
}

const sleep = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms));

async function isUp(target: HealthTarget, fetchImpl: typeof fetch): Promise<boolean> {
  const accepted = target.expect ?? [200];
  try {
    const res = await fetchImpl(target.url, { method: 'GET' });
    return accepted.includes(res.status);
  } catch {
    return false;
  }
}

/** Poll every target until all answer, or throw listing the stragglers on timeout. */
export async function waitForHealthy(
  targets: HealthTarget[],
  options: WaitOptions = {}
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 180_000;
  const intervalMs = options.intervalMs ?? 2_000;
  const fetchImpl = options.fetchImpl ?? fetch;
  const log = options.log ?? ((m: string) => console.log(`[health-wait] ${m}`));

  const deadline = Date.now() + timeoutMs;
  const pending = new Map(targets.map(t => [t.name, t]));

  for (;;) {
    for (const [name, target] of [...pending]) {
      if (await isUp(target, fetchImpl)) {
        log(`${name} is healthy`);
        pending.delete(name);
      }
    }
    if (pending.size === 0) return;
    if (Date.now() > deadline) {
      throw new Error(
        `stack-runner: timed out after ${timeoutMs}ms waiting for: ${[...pending.keys()].join(', ')}`
      );
    }
    await sleep(intervalMs);
  }
}
