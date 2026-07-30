/**
 * Which loader this app's bundle applies to the shared workspace packages.
 *
 * The workspace packages (`smoke-session`, `api-transport`, `temperaturechart`)
 * ship TS/TSX SOURCES — they have no prebuilt `dist` — so webpack must run
 * ts-loader over them. Locally `node_modules/<pkg>` is a symlink into
 * `packages/<pkg>`, so webpack reports the real path and the app's own
 * `exclude: /node_modules/` source rule happily compiles them. CI does NOT see
 * that layout: the publish workflow ships the workspace between jobs as an
 * upload-artifact, which DEREFERENCES symlinks, so the packages arrive as real
 * directories under `node_modules/`. There the `exclude: /node_modules/` rule
 * drops them and, without an explicit `include`, no loader is configured:
 *
 *   ERROR in ../../node_modules/smoke-session/src/wire/codecs.ts
 *   Module parse failed: Unexpected token
 *   You may need an appropriate loader to handle this file type
 *
 * That is a green local build and a red Docker publish (issue #412). These
 * tests model webpack's rule matching over BOTH layouts so a workspace package
 * added to this app without an include entry fails here, not in CI.
 */
import fs from 'fs';
import path from 'path';

/* eslint-disable @typescript-eslint/no-var-requires */
const devConfig: WebpackModuleConfig = require('../webpack.dev.js');
const prodConfig: WebpackModuleConfig = require('../webpack.prod.js');
const appManifest = require('../package.json');
/* eslint-enable @typescript-eslint/no-var-requires */

const REPO_ROOT = path.resolve(__dirname, '../../..');
const PACKAGES_DIR = path.join(REPO_ROOT, 'packages');
const NODE_MODULES_DIR = path.join(REPO_ROOT, 'node_modules');

type Condition = RegExp | string;

interface WebpackRule {
  test?: Condition;
  include?: Condition | Condition[];
  exclude?: Condition | Condition[];
  use?: string | { loader?: string } | Array<string | { loader?: string }>;
}

interface WebpackModuleConfig {
  module?: { rules?: WebpackRule[] };
}

/** Webpack condition semantics: RegExp is tested, a string is a path prefix. */
const conditionMatches = (condition: Condition, file: string): boolean =>
  condition instanceof RegExp ? condition.test(file) : file.startsWith(condition);

const anyCondition = (condition: Condition | Condition[], file: string): boolean =>
  Array.isArray(condition)
    ? condition.some(c => conditionMatches(c, file))
    : conditionMatches(condition, file);

/** The loader names webpack would apply to `file`, across all matching rules. */
const loadersFor = (config: WebpackModuleConfig, file: string): string[] =>
  (config.module?.rules ?? [])
    .filter(
      rule =>
        (rule.test === undefined || anyCondition(rule.test, file)) &&
        (rule.include === undefined || anyCondition(rule.include, file)) &&
        (rule.exclude === undefined || !anyCondition(rule.exclude, file))
    )
    .flatMap(rule => (Array.isArray(rule.use) ? rule.use : [rule.use]))
    .map(use => (typeof use === 'string' ? use : (use?.loader ?? '')));

/** Directory names under packages/ keyed by the package name apps depend on. */
const workspacePackageDirs = (): Map<string, string> => {
  const dirs = new Map<string, string>();
  for (const dir of fs.readdirSync(PACKAGES_DIR)) {
    const manifest = path.join(PACKAGES_DIR, dir, 'package.json');
    if (!fs.existsSync(manifest)) continue;
    dirs.set(JSON.parse(fs.readFileSync(manifest, 'utf8')).name, dir);
  }
  return dirs;
};

/** A representative non-test TS/TSX source file, relative to `<pkg>/src`. */
const sampleSource = (packageDir: string): string => {
  const srcRoot = path.join(PACKAGES_DIR, packageDir, 'src');
  const walk = (dir: string): string | undefined => {
    for (const entry of fs
      .readdirSync(dir, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const found = walk(full);
        if (found) return found;
      } else if (
        /\.tsx?$/.test(entry.name) &&
        !/\.(test|spec)\.tsx?$/.test(entry.name) &&
        !entry.name.endsWith('.d.ts')
      ) {
        return path.relative(srcRoot, full);
      }
    }
    return undefined;
  };
  const found = walk(srcRoot);
  if (!found) throw new Error(`no TS source found under ${srcRoot}`);
  return found;
};

const packageDirs = workspacePackageDirs();
const dependencies: Record<string, string> = appManifest.dependencies ?? {};
const dependedOn = Object.keys(dependencies).filter(name => packageDirs.has(name));

const cases = dependedOn.flatMap(name => {
  const relative = sampleSource(packageDirs.get(name) as string);
  return [
    // Local layout: node_modules/<pkg> is a symlink, webpack reports the real path.
    [
      name,
      'packages/ (symlinked workspace)',
      path.join(PACKAGES_DIR, packageDirs.get(name) as string, 'src', relative),
    ],
    // CI layout: upload-artifact dereferenced the symlink into a real directory.
    [
      name,
      'node_modules/ (dereferenced artifact)',
      path.join(NODE_MODULES_DIR, name, 'src', relative),
    ],
  ] as Array<[string, string, string]>;
});

describe('workspace package sources are compiled by the smoker bundle', () => {
  it('depends on at least one workspace package', () => {
    expect(dependedOn.length).toBeGreaterThan(0);
  });

  describe.each([
    ['webpack.dev.js', devConfig],
    ['webpack.prod.js', prodConfig],
  ])('%s', (_configName, config) => {
    it.each(cases)('runs ts-loader over %s sources in the %s layout', (_name, _layout, file) => {
      expect(loadersFor(config, file)).toContain('ts-loader');
    });
  });
});
