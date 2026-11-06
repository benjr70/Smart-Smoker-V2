/**
 * The hermetic stack's own store and backend, reached the only way a spec can
 * reach them: through docker.
 *
 * Most journeys have no business here — a spec that needs the database to
 * prove something is usually a spec asserting an implementation detail. The
 * exception this exists for is data a release *repairs*: rows written by a
 * version of the code that is gone cannot be created through the API any more,
 * so the only way to prove the repair is to plant them in the store the
 * backend boots against and boot it. See `tests/temp-series-repair.spec.ts`.
 *
 * Mongo publishes no host port (see `docker/docker-compose.e2e.yml`), so the
 * store is spoken to with `mongosh` inside its container. Both containers are
 * addressed by the fixed `container_name` the compose file gives them, which
 * is why the compose project name does not matter here.
 */
import { execFileSync } from 'node:child_process';
import { resolveUrls } from '../config/urls.ts';
import { waitForHealthy } from './wait-for-healthy.ts';

/** How docker is run. Injectable so the helpers above it stay unit-testable. */
export type Shell = (file: string, args: string[]) => string;

const MONGO_CONTAINER = 'e2e-mongo';
const BACKEND_CONTAINER = 'e2e-backend';
const DATABASE = 'smartsmoker';

const runDocker: Shell = (file, args) =>
  execFileSync(file, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

/**
 * Whether this run has a hermetic store to plant rows in.
 *
 * False for every target but the composed stack — the deployed and
 * virtual-smoker projects have no containers of these names, and planting rows
 * in a real archive is not something a test may do. A spec asks this and skips
 * itself rather than failing.
 */
export const hermeticStoreReady = (shell: Shell = runDocker): boolean => {
  try {
    const states = shell('docker', [
      'inspect',
      '-f',
      '{{.State.Running}}',
      MONGO_CONTAINER,
      BACKEND_CONTAINER,
    ])
      .trim()
      .split('\n')
      .map(state => state.trim());
    return states.length === 2 && states.every(state => state === 'true');
  } catch {
    return false;
  }
};

/** Runs a `mongosh` script against the stack's database, answering its output. */
export const mongoEval = (script: string, shell: Shell = runDocker): string =>
  shell('docker', [
    'exec',
    MONGO_CONTAINER,
    'mongosh',
    DATABASE,
    '--quiet',
    '--eval',
    script,
  ]).trim();

/**
 * The lines the backend has logged that mention `needle`, oldest first.
 *
 * Reads what the container has printed on stdout, which is where Nest's
 * `Logger.log` goes — enough to count how many times a boot-time repair has
 * announced itself across restarts.
 */
export const backendLogLines = (needle: string, shell: Shell = runDocker): string[] =>
  shell('docker', ['logs', BACKEND_CONTAINER])
    .split('\n')
    .filter(line => line.includes(needle));

/**
 * Restarts the backend and waits until it answers again — one boot, which is
 * what runs anything the backend does at boot.
 */
export const restartBackend = async (shell: Shell = runDocker): Promise<void> => {
  shell('docker', ['restart', BACKEND_CONTAINER]);
  await waitForHealthy([{ name: 'backend', url: `${resolveUrls().backend}/api/health` }], {
    intervalMs: 1_000,
    log: () => undefined,
  });
};
