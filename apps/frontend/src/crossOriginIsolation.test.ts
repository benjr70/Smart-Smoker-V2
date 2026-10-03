/**
 * Cross-origin isolation of the served frontend.
 *
 * Voice Fill's threaded speech model needs `SharedArrayBuffer`, which a browser
 * only hands to a page that is cross-origin isolated — and a page is only
 * isolated when the document it was loaded from carried both headers below.
 * Everything that serves this app therefore has to send them: the webpack dev
 * server (configured in the webpack configs) and the nginx image (configured in
 * nginx.conf). The running image is held to this by the e2e journey
 * `e2e/tests/cross-origin-isolation.spec.ts`; these tests hold the
 * configuration itself, which fails in seconds rather than after a stack boot.
 */
import fs from 'fs';
import path from 'path';

interface WebpackDevServerConfig {
  devServer?: { headers?: Record<string, string> };
}

/* eslint-disable @typescript-eslint/no-var-requires */
const devConfig: WebpackDevServerConfig = require('../webpack.dev.js');
const prodConfig: WebpackDevServerConfig = require('../webpack.prod.js');
/* eslint-enable @typescript-eslint/no-var-requires */

/** The two headers that together make a page cross-origin isolated. */
const ISOLATION_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

describe('webpack dev server', () => {
  // `npm start` serves webpack.dev.js; `npm run start:prod` serves the
  // production config through the same dev server.
  it.each([
    ['webpack.dev.js', devConfig],
    ['webpack.prod.js', prodConfig],
  ])('sends both cross-origin isolation headers from %s', (_name, config) => {
    expect(config.devServer?.headers).toMatchObject(ISOLATION_HEADERS);
  });
});

/**
 * nginx.conf, read as nginx reads it.
 *
 * Two of nginx's `add_header` rules decide whether "every response" is true,
 * and neither is visible in a browser that only loads the happy path:
 *
 *   - a block that declares ANY `add_header` of its own stops inheriting the
 *     ones declared above it, so a single cache header added to one `location`
 *     would silently strip isolation from everything that location serves;
 *   - without `always`, the header is left off error responses (a 502 while
 *     the backend restarts, a 404).
 */
interface AddHeader {
  name: string;
  value: string;
  always: boolean;
}

/** A `{ }` block that declares at least one `add_header` directly inside it. */
interface HeaderBlock {
  /** Brace depth: 1 is directly inside `server { }`, a `location` body is 2. */
  depth: number;
  headers: AddHeader[];
}

const SERVER_LEVEL = 1;

/**
 * The blocks of an nginx config that declare `add_header`, each with only the
 * headers written directly in it — which, by the inheritance rule above, are
 * the only ones nginx sends for that block.
 */
const headerBlocks = (source: string): HeaderBlock[] => {
  const conf = source.replace(/#.*$/gm, '');
  const open: HeaderBlock[] = [];
  const closed: HeaderBlock[] = [];
  for (const token of conf.match(/[{}]|add_header[^;]*;/g) ?? []) {
    if (token === '{') {
      open.push({ depth: open.length + 1, headers: [] });
    } else if (token === '}') {
      const block = open.pop();
      if (block) closed.push(block);
    } else {
      const [, name, value, ...flags] = token.replace(/;$/, '').split(/\s+/);
      open[open.length - 1]?.headers.push({ name, value, always: flags.includes('always') });
    }
  }
  return closed.filter(block => block.headers.length > 0);
};

/** Whether a block sends both isolation headers, on error responses too. */
const sendsIsolation = (block: HeaderBlock): boolean =>
  Object.entries(ISOLATION_HEADERS).every(([name, value]) =>
    block.headers.some(header => header.name === name && header.value === value && header.always)
  );

/** The blocks whose own `add_header`s have displaced the isolation pair. */
const blocksDroppingIsolation = (source: string): HeaderBlock[] =>
  headerBlocks(source).filter(block => !sendsIsolation(block));

describe('nginx.conf', () => {
  const conf = fs.readFileSync(path.resolve(__dirname, '../nginx.conf'), 'utf8');

  it.each(Object.entries(ISOLATION_HEADERS))(
    'sends %s: %s at server level, on error responses too',
    (name, value) => {
      const serverLevel = headerBlocks(conf).filter(block => block.depth === SERVER_LEVEL);
      expect(serverLevel.flatMap(block => block.headers)).toContainEqual({
        name,
        value,
        always: true,
      });
    }
  );

  it('repeats both isolation headers in every block that declares an add_header of its own', () => {
    expect(blocksDroppingIsolation(conf)).toEqual([]);
  });
});

/**
 * The rule itself, shown on configs small enough to read. nginx.conf has no
 * location-level `add_header` today, so without these the test above would
 * pass whether or not it could tell a safe location from an unsafe one.
 */
describe('the nginx add_header inheritance rule', () => {
  const PAIR = `
    add_header Cross-Origin-Opener-Policy same-origin always;
    add_header Cross-Origin-Embedder-Policy require-corp always;`;

  const serverWith = (location: string): string =>
    `server {${PAIR}\n    location /assets/ {${location}\n    }\n}`;

  it('accepts a location that declares no add_header and so inherits the pair', () => {
    expect(blocksDroppingIsolation(serverWith('try_files $uri =404;'))).toEqual([]);
  });

  it('accepts a location that adds a header of its own and repeats the pair', () => {
    const location = `add_header Cache-Control "public, immutable";${PAIR}`;
    expect(blocksDroppingIsolation(serverWith(location))).toEqual([]);
  });

  it.each([
    ['adds a header of its own without repeating the pair', 'add_header X-Robots-Tag noindex;'],
    [
      'repeats only one of the pair',
      'add_header X-Robots-Tag noindex;\n add_header Cross-Origin-Opener-Policy same-origin always;',
    ],
    [
      'repeats the pair without `always`',
      `add_header X-Robots-Tag noindex;${PAIR.replace(/ always/g, '')}`,
    ],
  ])('rejects a location that %s', (_case, location) => {
    expect(blocksDroppingIsolation(serverWith(location))).toHaveLength(1);
  });
});
