/**
 * Guards the build-time property that makes `resolveDeviceUrl`'s fallback safe.
 *
 * `REACT_APP_DEVICE_URL` is deliberately absent from the smoker env files: only a
 * hermetic per-PR stack bakes it in (see `deviceUrl.ts`), and adding it to
 * `.env.prod` would force the REST and socket call sites onto a single origin,
 * changing the temp socket on real hardware from 127.0.0.1 to localhost.
 *
 * Relying on the key's absence is only safe because dotenv-webpack replaces
 * `process.env` itself with a stub for web targets, so an unbaked read evaluates
 * to `undefined` instead of surviving as a bare `process.env` reference. That is
 * a property of a *dependency's* default behavior, and nothing else in the repo
 * asserts it. If it regressed — a dotenv-webpack major bump, an `ignoreStub`
 * change, a different `target` — the smoker bundle would throw at module load and
 * every Raspberry Pi would white-screen, with no build or unit-test failure to
 * catch it. The device would be the first thing to notice.
 *
 * So this compiles a fixture against the real `webpack.prod.js` Dotenv plugin and
 * evaluates the emitted bundle with `process` shadowed away, exactly as a browser
 * would. Only the entry module is a fixture; the plugin and target come from the
 * production config, so a change there is a change here.
 */
import { mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { setImmediate as nodeSetImmediate, clearImmediate as nodeClearImmediate } from 'timers';
import webpack from 'webpack';
import productionConfig from '../../webpack.prod.js';

// This suite runs a real webpack compile, but the CRA test environment is jsdom,
// which has no setImmediate — and webpack's async pipeline needs one. A
// `@jest-environment node` docblock is not an option here: it resolves the
// hoisted jest-environment-node, whose major does not match react-scripts' jest
// core. Lending the browser-shaped environment the two node timers webpack wants
// is the smaller compromise, and it affects nothing else in this file.
beforeAll(() => {
  const environment = globalThis as typeof globalThis & {
    setImmediate?: typeof nodeSetImmediate;
    clearImmediate?: typeof nodeClearImmediate;
  };
  environment.setImmediate ??= nodeSetImmediate;
  environment.clearImmediate ??= nodeClearImmediate;
});

/** A key `.env.prod` does define, and one it does not. */
const BAKED_KEY = 'REACT_APP_CLOUD_URL';
const UNBAKED_KEY = 'REACT_APP_DEVICE_URL';

interface FixtureExports {
  baked: string | undefined;
  unbaked: string | undefined;
}

/** The dotenv-webpack plugin instance the production build actually uses. */
const productionDotenvPlugin = (): webpack.WebpackPluginInstance => {
  const plugin = (productionConfig.plugins as webpack.WebpackPluginInstance[]).find(
    candidate => candidate?.constructor?.name === 'Dotenv'
  );
  if (!plugin) {
    throw new Error(
      'webpack.prod.js no longer registers a Dotenv plugin — the smoker bundle ' +
        'gets its REACT_APP_* values from somewhere else now, so this guard is stale'
    );
  }
  return plugin;
};

/**
 * Compile a module that reads both keys, using the production Dotenv plugin and
 * target, and return the emitted bundle source.
 */
const compileFixture = async (): Promise<string> => {
  const dir = mkdtempSync(join(tmpdir(), 'smoker-bundle-env-'));
  const entry = join(dir, 'entry.js');
  writeFileSync(
    entry,
    `module.exports = { baked: process.env.${BAKED_KEY}, unbaked: process.env.${UNBAKED_KEY} };\n`
  );

  await new Promise<void>((resolvePromise, rejectPromise) => {
    webpack(
      {
        mode: 'production',
        target: productionConfig.target,
        entry,
        output: { path: dir, filename: 'bundle.js', library: { type: 'commonjs2' } },
        plugins: [productionDotenvPlugin()],
      },
      (err, stats) => {
        if (err) return rejectPromise(err);
        if (stats?.hasErrors()) return rejectPromise(new Error(stats.toString('errors-only')));
        resolvePromise();
      }
    );
  });

  return readFileSync(join(dir, 'bundle.js'), 'utf-8');
};

/** Run bundle source the way a browser would: with no `process` in scope. */
const evaluateWithoutProcess = (source: string): FixtureExports => {
  const module = { exports: {} as FixtureExports };
  // Executing the compiled bundle is the whole point: only running it can show
  // that an unbaked read does not throw. Naming `process` as a parameter shadows
  // node's global, so the bundle sees the same absence a browser would.
  // eslint-disable-next-line no-new-func
  const run = new Function('process', 'module', 'exports', source);
  run(undefined, module, module.exports);
  return module.exports;
};

describe('smoker production bundle — unbaked REACT_APP_* reads', () => {
  jest.setTimeout(60000);

  it('yields undefined for a key the env file omits instead of throwing', async () => {
    const bundle = await compileFixture();

    const exported = evaluateWithoutProcess(bundle);

    expect(exported.unbaked).toBeUndefined();
  });

  it('still bakes in the keys the env file does define', async () => {
    const bundle = await compileFixture();

    const exported = evaluateWithoutProcess(bundle);

    // Without this the test above would pass even if the env wiring were removed
    // wholesale — everything undefined, nothing thrown.
    expect(exported.baked).toBe(
      readFileSync(join(__dirname, '..', '..', '.env.prod'), 'utf-8')
        .split('\n')
        .find(line => line.startsWith(`${BAKED_KEY}=`))
        ?.slice(`${BAKED_KEY}=`.length)
    );
  });
});
