/**
 * The package's entry point has to be a file the build actually produces.
 *
 * Every consumer in this repo deep-imports the TypeScript sources
 * (`temperaturechart/src/...`), which their bundlers compile themselves, so a
 * broken `main` stays invisible: it went years naming `dist/tempChart.js` while
 * the build transpiled nothing at all. Anyone resolving the package by name —
 * a node script, a test harness, a future app that does not special-case the
 * workspace — gets a module-not-found instead.
 *
 * So the manifest's promise is checked against the build itself rather than
 * against a hand-kept list of filenames.
 */
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const PACKAGE_ROOT = path.resolve(__dirname, '..');

const manifest = JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8')) as {
  main: string;
  types: string;
};

describe('the package entry point', () => {
  /** Running a real build is slow enough to need more than jest's default. */
  jest.setTimeout(120_000);

  beforeAll(() => {
    try {
      execFileSync('npm', ['run', 'build'], { cwd: PACKAGE_ROOT, stdio: 'pipe' });
    } catch (failure) {
      // A compiler error here is the point of the test, so show it rather than
      // the bare non-zero exit npm reports.
      const { stdout, stderr } = failure as { stdout?: Buffer; stderr?: Buffer };
      throw new Error(`the package build failed:\n${stdout ?? ''}${stderr ?? ''}`);
    }
  });

  it.each([
    ['main', () => manifest.main],
    ['types', () => manifest.types],
  ])('names a %s file that the build emits', (_field, entry) => {
    expect(fs.existsSync(path.join(PACKAGE_ROOT, entry()))).toBe(true);
  });

  it('emits an entry point that loads, and hands back the chart', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const built = require(path.join(PACKAGE_ROOT, manifest.main));

    expect(typeof built.default).toBe('function');
  });
});
