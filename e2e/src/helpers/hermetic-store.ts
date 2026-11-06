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

/**
 * Room for the whole of a service's log. The default is a megabyte, and a
 * backend that has served a suite has said more than that — which comes back
 * as `ENOBUFS` rather than as truncation, so the size has to be asked for.
 */
const LOG_BUFFER_BYTES = 64 * 1024 * 1024;

const runDocker: Shell = (file, args) =>
  execFileSync(file, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: LOG_BUFFER_BYTES,
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
 * The one day every planted legacy cook is dated to.
 *
 * Planted rows cannot be named, so they cannot carry the `smoke-test-` prefix
 * the fixture's hygiene net is built on (see `api/test-entity.ts`): a cook is
 * recognised through its pre-smoke's name, and the rows a repair has to be
 * proved against are written straight into the store. A reserved day is the
 * substitute — nothing else in the suite is dated to it, so everything dated
 * within it is this suite's to remove, and the removal needs no ids.
 */
const PLANTED_DAY = {
  from: '2026-01-02T00:00:00Z',
  to: '2026-01-03T00:00:00Z',
};

/** Where a planting spec dates its rows, for the spec to build them from. */
export const PLANTED_AT = PLANTED_DAY.from;

const SWEEP_PLANTED = `
  const planted = { $gte: new Date('${PLANTED_DAY.from}'), $lt: new Date('${PLANTED_DAY.to}') };
  const cooks = db.smokes.find({ date: planted }).toArray();
  cooks.forEach(cook => {
    if (cook.preSmokeId) { db.presmokes.deleteOne({ _id: ObjectId(cook.preSmokeId) }); }
  });
  db.smokes.deleteMany({ date: planted });
  const readings = db.temps.deleteMany({ date: planted });
  // db.stats is mongosh's own command, so the collection is asked by name.
  db.getCollection('stats').updateOne({}, { $set: { dirty: true } });
  print(cooks.length + ' ' + readings.deletedCount);
`;

/**
 * Takes every planted legacy cook back out — the cook, the pre-smoke it links
 * and its readings — and tells the statistics the archive changed. Answers how
 * many cooks and readings went, so a caller can tell a clean start from a
 * dirty one.
 *
 * Run by the suite's global setup as well as by the spec that plants, because
 * a spec killed between its plant and its own cleanup leaves a cook behind,
 * and a cook the other journeys read in the cook list but whose pre-smoke they
 * cannot resolve poisons them. Reclaiming by the day rather than by ids is
 * what makes that recoverable without the ids the killed process was holding.
 *
 * A no-op where there is no hermetic store: every other target is a real
 * archive, which this may not touch.
 */
export const sweepPlantedCooks = (shell: Shell = runDocker): string => {
  if (!hermeticStoreReady(shell)) {
    return '0 0';
  }
  return mongoEval(SWEEP_PLANTED, shell);
};

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
