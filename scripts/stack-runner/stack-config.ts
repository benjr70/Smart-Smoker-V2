/**
 * Deterministic per-PR stack configuration.
 *
 * Given a PR number, derives a compose project name and an isolated block of
 * published host ports for the five stack services (frontend, backend,
 * device-service, smoker web, mongo). Ports live in a high alternate range so a
 * per-PR stack never collides with the dev defaults (frontend 3000, backend
 * 3001, device 3003, smoker 8080, mongo 27017) and two distinct PRs get
 * disjoint blocks.
 *
 * Pure module — no I/O, no docker. This is the unit-tested core (behaviors 1 & 2
 * of issue #328).
 */

/** Hermetic MongoDB database name (matches the backend DB_URL in the e2e stack). */
export const MONGO_DB_NAME = 'smartsmoker';

/**
 * Host ports the dev environment claims. A per-PR stack must avoid every one of
 * these so a running dev stack and a PR stack coexist on the same box.
 */
export const RESERVED_DEV_PORTS: readonly number[] = [3000, 3001, 3002, 3003, 8080, 27017];

/** First host port of the per-PR alternate range. Well clear of the dev ports. */
export const PORT_BASE = 20000;
/** Ports reserved per PR stack (five services + headroom). */
export const PORT_BLOCK_SIZE = 10;
/** Number of distinct PR slots before port blocks wrap and could reuse. */
export const PORT_SLOTS = 1000;

/** Published host ports for one hermetic stack. */
export interface StackPorts {
  frontend: number;
  backend: number;
  device: number;
  smoker: number;
  mongo: number;
}

/** Fully-resolved configuration for one hermetic per-PR stack. */
export interface StackConfig {
  prNumber: number;
  projectName: string;
  ports: StackPorts;
}

/** True when `port` is one the dev environment publishes. */
export function isReservedDevPort(port: number): boolean {
  return RESERVED_DEV_PORTS.includes(port);
}

function assertValidPr(prNumber: number): void {
  if (!Number.isInteger(prNumber) || prNumber <= 0) {
    throw new Error(`stack-runner: PR number must be a positive integer, got: ${prNumber}`);
  }
}

/**
 * Derive the deterministic project name + port block for a PR.
 *
 * The block base is `PORT_BASE + (pr % PORT_SLOTS) * PORT_BLOCK_SIZE`, so every
 * PR in a 1000-wide window lands on its own 10-port block, all of them far above
 * the reserved dev ports.
 */
export function computeStackConfig(prNumber: number): StackConfig {
  assertValidPr(prNumber);

  const base = PORT_BASE + (prNumber % PORT_SLOTS) * PORT_BLOCK_SIZE;
  const ports: StackPorts = {
    frontend: base + 0,
    backend: base + 1,
    device: base + 2,
    smoker: base + 3,
    mongo: base + 4,
  };

  return {
    prNumber,
    projectName: `smoker-pr-${prNumber}`,
    ports,
  };
}

/** Host URLs an external consumer uses to reach the stack. */
export interface StackUrls {
  frontend: string;
  backend: string;
  device: string;
  smoker: string;
  mongo: string;
}

/** Build the localhost URLs / mongo connection string for a config. */
export function resolveStackUrls(config: StackConfig): StackUrls {
  const { ports } = config;
  return {
    frontend: `http://localhost:${ports.frontend}`,
    backend: `http://localhost:${ports.backend}`,
    device: `http://localhost:${ports.device}`,
    smoker: `http://localhost:${ports.smoker}`,
    mongo: `mongodb://localhost:${ports.mongo}/${MONGO_DB_NAME}`,
  };
}

/**
 * Stable, parseable stdout contract: one `KEY=value` line per service URL, the
 * mongo connection string, and the project name. Keys are the same env var
 * names the e2e Playwright suite reads (`E2E_*`), so the block can be sourced
 * directly as the environment for a later test-run slice.
 */
export function formatStackOutput(config: StackConfig): string {
  const urls = resolveStackUrls(config);
  const lines = [
    `E2E_FRONTEND_URL=${urls.frontend}`,
    `E2E_BACKEND_URL=${urls.backend}`,
    `E2E_DEVICE_URL=${urls.device}`,
    `E2E_SMOKER_URL=${urls.smoker}`,
    `E2E_MONGO_URL=${urls.mongo}`,
    `STACK_PROJECT_NAME=${config.projectName}`,
  ];
  return lines.join('\n') + '\n';
}
