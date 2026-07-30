/**
 * Which axios copy this app's bundle links.
 *
 * The only `import axios from 'axios'` in the API layer now lives in the shared
 * `api-transport` package, where axios is a PEER dependency: every consuming app
 * is supposed to supply its own copy. Webpack resolves a bare specifier from the
 * ISSUER directory, and the issuer is now `packages/api-transport/src`, so the
 * node_modules walk leaves this app's tree entirely and lands on the repo-root
 * hoisted axios — silently ignoring the version pinned in this app's
 * package.json (and making any future bump here, e.g. a security patch, inert).
 *
 * The webpack configs therefore alias axios to this app's own copy. These tests
 * fail if that alias is dropped or points somewhere else.
 */
import path from 'path';

interface WebpackResolveConfig {
  resolve?: { alias?: Record<string, string> };
}

/* eslint-disable @typescript-eslint/no-var-requires */
const devConfig: WebpackResolveConfig = require('../../webpack.dev.js');
const prodConfig: WebpackResolveConfig = require('../../webpack.prod.js');
/* eslint-enable @typescript-eslint/no-var-requires */

/** Where the shared axios import is issued from, as webpack sees it. */
const API_TRANSPORT_SRC = path.resolve(__dirname, '../../../../packages/api-transport/src');

/** The axios package.json npm installed for THIS app (its declared pin). */
const ownAxiosManifest = require.resolve('axios/package.json');

/**
 * The axios manifest the bundle will link, modelling webpack's resolution:
 * `resolve.alias` wins, otherwise a node_modules walk from the issuer directory.
 */
const bundledAxiosManifest = (config: WebpackResolveConfig): string => {
  const alias = config.resolve?.alias?.axios;
  return alias
    ? require.resolve(path.join(alias, 'package.json'))
    : require.resolve('axios/package.json', { paths: [API_TRANSPORT_SRC] });
};

const versionOf = (manifest: string): string => require(manifest).version;

describe.each([
  ['webpack.dev.js', devConfig],
  ['webpack.prod.js', prodConfig],
])('%s — axios pinning for the shared api-transport import', (_name, config) => {
  it("aliases axios to this app's own installed copy", () => {
    expect(config.resolve?.alias?.axios).toBe(path.dirname(ownAxiosManifest));
  });

  it('links the axios version installed for this app, not whatever the shared package walks up to', () => {
    expect(versionOf(bundledAxiosManifest(config))).toBe(versionOf(ownAxiosManifest));
  });
});
