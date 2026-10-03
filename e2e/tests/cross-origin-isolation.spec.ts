import { expect, test } from '@playwright/test';
import { FrontendApp } from '../src/pageObjects/FrontendApp';

/**
 * Cross-origin isolation of the served frontend (issue #701).
 *
 * Voice Fill's threaded speech model needs `SharedArrayBuffer`, which a browser
 * only hands to a page that is cross-origin isolated. Isolation is granted when
 * the document arrives with `Cross-Origin-Opener-Policy: same-origin` and
 * `Cross-Origin-Embedder-Policy: require-corp`, so the frontend's nginx sends
 * the pair on everything it answers.
 *
 * Nothing the user sees changes, so there is no screen to assert on. What is
 * held instead is the one flag the feature depends on, plus the pair on each
 * kind of response nginx produces — because nginx drops inherited headers from
 * any location that declares one of its own, and leaves them off error
 * responses unless told otherwise, and neither failure shows on the happy path.
 *
 * That the app still works once isolated — screens load, the API and socket
 * answer, live temperatures arrive — is not re-asserted here: every other
 * journey in this suite now runs against the isolated page and holds exactly
 * that.
 *
 * Deliberately untagged, so it runs only in the `hermetic` project. A browser
 * ignores the opener policy on an origin it does not trust, so the flag is only
 * a fair demand of a stack known to be served from localhost or over https.
 */
const ISOLATION_HEADERS = {
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-embedder-policy': 'require-corp',
};

test('cross-origin isolation: the served page reports itself isolated', async ({ page }) => {
  const frontend = new FrontendApp(page);

  // `goto` waits for the wizard and its first load, so this also holds that
  // the app boots and reaches the API from inside an isolated page.
  await frontend.goto();

  await frontend.expectCrossOriginIsolated();
});

for (const [kind, path, status] of [
  ['the document', '/', 200],
  ['a static asset', '/manifest.json', 200],
  ['the service worker script', '/sw.js', 200],
  ['the SPA fallback', '/a/route/only/the/app/knows', 200],
  ['a proxied API response', '/api/health', 200],
  ['a proxied API error', '/api/no-such-route', 404],
  ['the proxied socket handshake', '/socket.io/?EIO=4&transport=polling', 200],
] as const) {
  test(`cross-origin isolation: ${kind} carries both isolation headers`, async ({ request }) => {
    const response = await request.get(path);

    // Pin the status too: a probe that quietly started landing on the SPA
    // fallback would still carry the headers and prove nothing about its kind.
    expect(response.status()).toBe(status);
    expect(response.headers()).toMatchObject(ISOLATION_HEADERS);
  });
}
