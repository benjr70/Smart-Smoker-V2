/**
 * Where the Transformers.js runtime ends up in the built app.
 *
 * The runtime is the largest of the three Voice Fill carries, and none of its
 * models is one a fresh phone gets. A cook who never picks one of them must
 * not download the runtime or the adapter that drives it, so both have to stay
 * out of the bundle the page starts with and sit in chunks fetched only when
 * one of those models is downloaded, proven, listened with or read with.
 *
 * Two things hold that, and both are held here. The application reaches the
 * runtime only through `transformersModels.ts`; and what webpack builds of
 * that module, with the configuration `npm run build` uses, starts without the
 * runtime and carries it in a chunk of its own. The second is read off a real
 * build — of that one module, since building the whole app beside the rest of
 * the suite costs more than the answer is worth.
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const FRONTEND_ROOT = path.resolve(__dirname, '../..');
const SOURCES = path.join(FRONTEND_ROOT, 'src');

const BUILD_TIMEOUT_MS = 180_000;

/** A name only the runtime answers to: what it lists a pipeline's files with. */
const RUNTIME_MARKER = 'get_pipeline_files';

/** A name only what holds an answer to a schema answers to. */
const CONSTRAINT_MARKER = 'StructuredOutputProcessor';

/** A name only the adapter's side answers to: how it has a long Ramble heard. */
const ADAPTER_MARKER = 'stride_length_s: 5';

/** Every source file of the app, tests included. */
const sourceFiles = (directory: string = SOURCES): string[] =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const found = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(found);
    }
    return /\.tsx?$/.test(entry.name) ? [found] : [];
  });

describe('the application’s sources', () => {
  const importing = (pattern: RegExp): string[] =>
    sourceFiles()
      .filter(file => pattern.test(fs.readFileSync(file, 'utf8')))
      .map(file => path.relative(SOURCES, file));

  test('only the adapter imports the Transformers.js runtime', () => {
    expect(importing(/from\s+['"]@huggingface\/transformers[^'"]*['"]/)).toEqual([
      path.join('voiceFill', 'transformersAdapter.ts'),
    ]);
  });

  test('nothing imports the adapter outright: it is reached by a lazy import alone', () => {
    expect(importing(/from\s+['"][^'"]*\/transformersAdapter['"]/)).toEqual([]);
    expect(
      importing(/\bimport\(\s*(?:\/\*[^*]*\*\/\s*)?['"][^'"]*\/transformersAdapter['"]/)
    ).toEqual([path.join('voiceFill', 'transformersModels.ts')]);
  });
});

describe('what is built of the Transformers.js models', () => {
  let built: string;

  beforeAll(() => {
    built = fs.mkdtempSync(path.join(os.tmpdir(), 'voice-fill-build-'));
    const build = spawnSync(
      process.execPath,
      [
        require.resolve('webpack/bin/webpack.js'),
        '--config',
        'webpack.prod.js',
        '--entry',
        './src/voiceFill/transformersModels.ts',
        // Neither changes which file a module lands in, and both cost time.
        '--no-devtool',
        '--no-optimization-minimize',
        '--output-path',
        built,
      ],
      { cwd: FRONTEND_ROOT, encoding: 'utf8', timeout: BUILD_TIMEOUT_MS }
    );
    if (build.status !== 0) {
      throw new Error(`The build failed:\n${build.stdout}\n${build.stderr}`);
    }
  }, BUILD_TIMEOUT_MS);

  afterAll(() => {
    fs.rmSync(built, { recursive: true, force: true });
  });

  const holds = (marker: string) => (file: string) =>
    fs.readFileSync(path.join(built, file), 'utf8').includes(marker);

  /** The scripts the page itself asks for: what it starts with. */
  const startedWith = (): string[] => {
    const page = fs.readFileSync(path.join(built, 'index.html'), 'utf8');
    return Array.from(page.matchAll(/<script[^>]*\ssrc="([^"]+)"/g), match =>
      path.basename(match[1])
    );
  };

  /** The scripts the page fetches only when something asks for them. */
  const lazy = (): string[] =>
    fs
      .readdirSync(built)
      .filter(file => file.startsWith('bundle.') && !startedWith().includes(file));

  test('starts with a bundle that contains neither the runtime nor the adapter', () => {
    const main = startedWith();

    expect(main.length).toBeGreaterThan(0);
    expect(main.filter(holds(RUNTIME_MARKER))).toEqual([]);
    expect(main.filter(holds(CONSTRAINT_MARKER))).toEqual([]);
    expect(main.filter(holds(ADAPTER_MARKER))).toEqual([]);
  });

  test('carries the runtime, what holds an answer to a schema, and the adapter in chunks of their own', () => {
    expect(lazy().filter(holds(RUNTIME_MARKER)).length).toBeGreaterThan(0);
    expect(lazy().filter(holds(CONSTRAINT_MARKER)).length).toBeGreaterThan(0);
    expect(lazy().filter(holds(ADAPTER_MARKER)).length).toBeGreaterThan(0);
  });
});
