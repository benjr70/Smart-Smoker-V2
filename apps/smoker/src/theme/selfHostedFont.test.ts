/**
 * The design typeface has to come out of this app's own bundle.
 *
 * The smoker hangs on a garage wall behind a tailnet and may have no route to
 * the public internet at all, so a stylesheet fetched from a font CDN would
 * simply never arrive and the panel would render in whatever sans-serif the
 * appliance happens to have. These tests fail if the webfont stops being a
 * bundled dependency, if the bundlers stop emitting its files, or if a remote
 * font host creeps into the app's pages. They mirror the web application's
 * `selfHostedFont.test.ts`, because the two apps ship the same face for the
 * same reason.
 */
import fs from 'fs';
import path from 'path';

const FONT_PACKAGE = '@fontsource/plus-jakarta-sans';
const SRC = path.resolve(__dirname, '..');
const HTML_TEMPLATE = path.resolve(__dirname, '../../public/index.html');

/**
 * Where the webfont is installed. Resolved via the package manifest rather than
 * a stylesheet, because jest's `moduleNameMapper` rewrites every `.css`
 * specifier to a stub and would "resolve" a package that is not installed.
 */
const fontPackageDir = (): string => path.dirname(require.resolve(`${FONT_PACKAGE}/package.json`));

/** Every source and stylesheet the app ships, excluding its tests. */
const appFiles = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return appFiles(full);
    if (!/\.(tsx?|css)$/.test(entry.name)) return [];
    if (/\.test\.tsx?$/.test(entry.name)) return [];
    return [full];
  });

/** The face stylesheets the shipped source pulls into the bundle, on disk. */
const importedFaceStylesheets = (): string[] => {
  const specifier = new RegExp(`^import\\s+['"]${FONT_PACKAGE}/([^'"]+)['"]`, 'gm');
  return appFiles(SRC).flatMap(file =>
    Array.from(fs.readFileSync(file, 'utf8').matchAll(specifier)).map(match =>
      path.join(fontPackageDir(), match[1])
    )
  );
};

describe('the design typeface is served by the appliance itself', () => {
  it('is a dependency this app declares, not a hoisting accident', () => {
    /* eslint-disable-next-line @typescript-eslint/no-var-requires */
    const manifest = require('../../package.json') as { dependencies?: Record<string, string> };
    expect(manifest.dependencies?.[FONT_PACKAGE]).toBeDefined();
  });

  it('is pulled into the bundle by the shipped source', () => {
    expect(importedFaceStylesheets().length).toBeGreaterThan(0);
  });

  it('points every font file it declares at a relative path present on disk', () => {
    importedFaceStylesheets().forEach(stylesheet => {
      expect(fs.existsSync(stylesheet)).toBe(true);
      const css = fs.readFileSync(stylesheet, 'utf8');

      const urls = Array.from(css.matchAll(/url\(([^)]+)\)/g)).map(match =>
        match[1].replace(/['"]/g, '').trim()
      );
      expect(urls.length).toBeGreaterThan(0);

      urls.forEach(url => {
        expect(url).not.toMatch(/^(https?:)?\/\//);
        const file = path.resolve(path.dirname(stylesheet), url.split(/[?#]/)[0]);
        expect(fs.existsSync(file)).toBe(true);
      });
    });
  });

  it('is never requested from a remote font host', () => {
    [HTML_TEMPLATE, ...appFiles(SRC)].forEach(file => {
      const contents = fs.readFileSync(file, 'utf8');
      expect(contents).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
      // Any absolute-host stylesheet link is a request the box may not be able
      // to make; the app has no legitimate need for one.
      expect(contents).not.toMatch(/<link[^>]+rel=["']stylesheet["'][^>]*href=["'](https?:)?\/\//i);
    });
  });
});

interface WebpackModuleConfig {
  module?: { rules?: Array<{ test?: RegExp; type?: string; use?: unknown }> };
}

/* eslint-disable @typescript-eslint/no-var-requires */
const devConfig: WebpackModuleConfig = require('../../webpack.dev.js');
const prodConfig: WebpackModuleConfig = require('../../webpack.prod.js');
/* eslint-enable @typescript-eslint/no-var-requires */

describe.each([
  ['webpack.dev.js', devConfig],
  ['webpack.prod.js', prodConfig],
])('%s — bundling the self-hosted typeface', (_name, config) => {
  it('emits the font files the face stylesheets reference', () => {
    const ruleFor = (file: string) =>
      config.module?.rules?.find(rule => rule.test instanceof RegExp && rule.test.test(file));

    expect(ruleFor('plus-jakarta-sans-latin-400-normal.woff2')?.type).toBe('asset/resource');
    expect(ruleFor('plus-jakarta-sans-latin-400-normal.woff')?.type).toBe('asset/resource');
  });
});
