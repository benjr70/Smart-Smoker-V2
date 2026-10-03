/**
 * Cross-origin isolation of the frontend as the webpack dev server serves it.
 *
 * Voice Fill's threaded speech model needs `SharedArrayBuffer`, which a browser
 * only hands to a page that is cross-origin isolated — and a page is only
 * isolated when the document it was loaded from carried both headers below.
 * Everything that serves this app therefore has to send them.
 *
 * These tests start the dev server the way `npm start` and `npm run start:prod`
 * do and ask it for the document, so they hold what is actually served rather
 * than what the webpack configs say. The nginx image is held the same way, over
 * HTTP against the built image, by `e2e/tests/cross-origin-isolation.spec.ts`.
 */
import { ChildProcess, spawn } from 'child_process';
import fs from 'fs';
import http from 'http';
import net from 'net';
import os from 'os';
import path from 'path';

const FRONTEND_ROOT = path.resolve(__dirname, '..');

const { scripts } = JSON.parse(
  fs.readFileSync(path.join(FRONTEND_ROOT, 'package.json'), 'utf8')
) as { scripts: Record<string, string> };

/**
 * What a cross-origin isolated document arrives with, as node reports response
 * headers (lower-cased names). Stated here rather than imported from
 * crossOriginIsolationHeaders.js: this is what the browser requires, so a wrong
 * value in that file must fail these tests, not be agreed with.
 */
const ISOLATION_HEADERS = {
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-embedder-policy': 'require-corp',
};

const BOOT_TIMEOUT_MS = 60_000;

/** A port nothing is listening on, so a developer's own `npm start` can stay up. */
const freePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, () => {
      const { port } = probe.address() as net.AddressInfo;
      probe.close(() => resolve(port));
    });
  });

/**
 * The arguments an npm script hands to webpack-dev-server, changed in only the
 * three ways a test needs: no browser window, a free port, and an empty module
 * in place of the app's entry so the server answers in a second or two instead
 * of after type-checking the whole app. The config file, and every other flag
 * that decides how it is served, are the script's own.
 */
const devServerArgs = (script: string, port: number, entry: string): string[] => [
  ...script
    .replace(/--port\s+\d+/, `--port ${port}`)
    .split(/\s+/)
    .slice(1)
    .filter(flag => flag !== '--open'),
  '--entry-reset',
  '--entry',
  entry,
];

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

const getDocument = (port: number): Promise<http.IncomingMessage> =>
  new Promise((resolve, reject) => {
    http
      .get({ host: 'localhost', port, path: '/' }, response => {
        response.resume();
        resolve(response);
      })
      .once('error', reject);
  });

describe('the webpack dev server', () => {
  let scratch: string;
  let entry: string;
  let server: ChildProcess | undefined;

  beforeAll(() => {
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'frontend-dev-server-'));
    entry = path.join(scratch, 'entry.js');
    fs.writeFileSync(entry, 'export {};\n');
  });

  afterEach(async () => {
    const running = server;
    server = undefined;
    if (running && running.exitCode === null) {
      const exited = new Promise(resolve => running.once('exit', resolve));
      running.kill();
      await exited;
    }
  });

  afterAll(() => {
    fs.rmSync(scratch, { recursive: true, force: true });
  });

  /** Start the dev server as `npm run <script>` would and fetch the document. */
  const documentServedBy = async (script: string): Promise<http.IncomingMessage> => {
    const port = await freePort();
    let output = '';
    const child = spawn(
      process.execPath,
      [
        require.resolve('webpack-dev-server/bin/webpack-dev-server.js'),
        ...devServerArgs(scripts[script], port, entry),
      ],
      { cwd: FRONTEND_ROOT, stdio: ['ignore', 'pipe', 'pipe'] }
    );
    server = child;
    child.stdout?.on('data', chunk => (output += chunk));
    child.stderr?.on('data', chunk => (output += chunk));

    const deadline = Date.now() + BOOT_TIMEOUT_MS - 5_000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) {
        throw new Error(`\`npm run ${script}\` exited with ${child.exitCode}:\n${output}`);
      }
      try {
        return await getDocument(port);
      } catch {
        // Not listening yet.
        await sleep(250);
      }
    }
    throw new Error(`\`npm run ${script}\` never answered on port ${port}:\n${output}`);
  };

  // `npm start` serves webpack.dev.js; `npm run start:prod` serves the
  // production config through the same dev server.
  it.each(['start', 'start:prod'])(
    'serves the document with both cross-origin isolation headers under `npm run %s`',
    async script => {
      const response = await documentServedBy(script);

      expect(response.statusCode).toBe(200);
      expect(response.headers).toMatchObject(ISOLATION_HEADERS);
    },
    BOOT_TIMEOUT_MS
  );
});
