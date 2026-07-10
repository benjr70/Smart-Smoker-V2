/**
 * Poll the composed stack's health endpoints until every service answers, so
 * specs never start racing a container that is still booting. Used by the
 * Playwright global setup; the compose healthchecks gate container ordering,
 * this gates the test run itself.
 */
import { resolveUrls } from '../config/urls';

export interface HealthTarget {
  name: string;
  url: string;
  /** Status codes that count as healthy (defaults to 200). */
  expect?: number[];
}

export interface WaitOptions {
  timeoutMs?: number;
  intervalMs?: number;
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  log?: (msg: string) => void;
}

export function defaultHealthTargets(env: NodeJS.ProcessEnv = process.env): HealthTarget[] {
  const u = resolveUrls(env);
  return [
    { name: 'backend', url: `${u.backend}/api/health` },
    { name: 'device-service', url: `${u.device}/api/health` },
    { name: 'frontend', url: `${u.frontend}/` },
    { name: 'smoker', url: `${u.smoker}/` },
  ];
}

async function isUp(target: HealthTarget, fetchImpl: typeof fetch): Promise<boolean> {
  const ok = target.expect ?? [200];
  try {
    const res = await fetchImpl(target.url, { method: 'GET' });
    return ok.includes(res.status);
  } catch {
    return false;
  }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export async function waitForHealthy(
  targets: HealthTarget[],
  options: WaitOptions = {}
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 180_000;
  const intervalMs = options.intervalMs ?? 2_000;
  const fetchImpl = options.fetchImpl ?? fetch;
  const log = options.log ?? ((m: string) => console.log(`[wait-for-healthy] ${m}`));

  const deadline = Date.now() + timeoutMs;
  const pending = new Map(targets.map(t => [t.name, t]));

  while (pending.size > 0) {
    for (const [name, target] of [...pending]) {
      if (await isUp(target, fetchImpl)) {
        log(`${name} is healthy`);
        pending.delete(name);
      }
    }
    if (pending.size === 0) break;
    if (Date.now() > deadline) {
      throw new Error(
        `Timed out after ${timeoutMs}ms waiting for: ${[...pending.keys()].join(', ')}`
      );
    }
    await sleep(intervalMs);
  }
}
