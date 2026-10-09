/**
 * Where the Moonshine binding ends up in the built app.
 *
 * The binding is some thirteen megabytes of WebAssembly and the code that
 * drives it. A cook who never taps Voice fill must not download it, so it has
 * to stay out of the bundle the page starts with and sit in a chunk fetched
 * only when the model is downloaded, proven or listened with.
 *
 * Two things hold that, and both are held here. The application reaches the
 * binding only through `moonshineModel.ts`; and what webpack builds of that
 * module, with the configuration `npm run build` uses, starts without the
 * binding and carries it in a chunk of its own. The second is read off a real
 * build — of that one module, since building the whole app beside the rest of
 * the suite costs more than the answer is worth.
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const FRONTEND_ROOT = path.resolve(__dirname, '../..');
const SOURCES = path.join(FRONTEND_ROOT, 'src');

const BUILD_TIMEOUT_MS = 120_000;

/** A name only the binding answers to: what it lists a model's files with. */
const BINDING_MARKER = 'sttDependencies';

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

  test('only the adapter imports the Moonshine binding', () => {
    expect(importing(/from\s+['"]@moonshine-ai\/moonshine-wasm['"]/)).toEqual([
      path.join('voiceFill', 'moonshineAdapter.ts'),
    ]);
  });

  test('nothing imports the adapter outright: it is reached by a lazy import alone', () => {
    expect(importing(/from\s+['"][^'"]*\/moonshineAdapter['"]/)).toEqual([]);
    expect(importing(/\bimport\(\s*(?:\/\*[^*]*\*\/\s*)?['"][^'"]*\/moonshineAdapter['"]/)).toEqual(
      [path.join('voiceFill', 'moonshineModel.ts')]
    );
  });
});

describe('what is built of the Moonshine model', () => {
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
        './src/voiceFill/moonshineModel.ts',
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

  const holdsBinding = (file: string): boolean =>
    fs.readFileSync(path.join(built, file), 'utf8').includes(BINDING_MARKER);

  /** The scripts the page itself asks for: what it starts with. */
  const startedWith = (): string[] => {
    const page = fs.readFileSync(path.join(built, 'index.html'), 'utf8');
    return Array.from(page.matchAll(/<script[^>]*\ssrc="([^"]+)"/g), match =>
      path.basename(match[1])
    );
  };

  test('starts with a bundle that does not contain the binding', () => {
    const main = startedWith();

    expect(main.length).toBeGreaterThan(0);
    expect(main.filter(holdsBinding)).toEqual([]);
  });

  test('carries the binding in a chunk of its own, with its WebAssembly beside it', () => {
    const lazy = fs
      .readdirSync(built)
      .filter(file => file.startsWith('bundle.') && !startedWith().includes(file));

    expect(lazy.filter(holdsBinding).length).toBeGreaterThan(0);
    expect(fs.readdirSync(built).some(file => file.endsWith('.wasm'))).toBe(true);
  });
});
