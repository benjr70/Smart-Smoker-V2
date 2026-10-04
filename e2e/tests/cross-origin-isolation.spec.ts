import { test } from '@playwright/test';
import { FrontendApp, SERVED_RESPONSE_KINDS } from '../src/pageObjects/FrontendApp';

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
 * held instead is the one flag the feature depends on, the pair on each kind of
 * response nginx produces, and the service worker push notifications rest on
 * still activating from the isolated page.
 *
 * That the app still works once isolated — screens load, the API and socket
 * answer, live temperatures arrive — is not re-asserted here: every other
 * journey in this suite now runs against the isolated page and holds exactly
 * that.
 *
 * `@deployed`-safe, and wanted there: these journeys only read, and dev-cloud
 * is where a stale image or a TLS front that drops a header would leave real
 * phones un-isolated while the hermetic stack stayed green. Dev-cloud is served
 * over https, so the browser trusts the origin just as it trusts localhost.
 */
test(
  'cross-origin isolation: the served page reports itself isolated',
  { tag: '@deployed' },
  async ({ page }) => {
    const frontend = new FrontendApp(page);

    // `goto` waits for the wizard and its first load, so this also holds that
    // the app boots and reaches the API from inside an isolated page.
    await frontend.goto();

    await frontend.expectCrossOriginIsolated();
  }
);

for (const kind of SERVED_RESPONSE_KINDS) {
  test(
    `cross-origin isolation: ${kind} carries both isolation headers`,
    { tag: '@deployed' },
    async ({ page }) => {
      await new FrontendApp(page).expectIsolationHeadersOn(kind);
    }
  );
}

test(
  'cross-origin isolation: the service worker still activates from the isolated page',
  { tag: '@deployed' },
  async ({ page }) => {
    const frontend = new FrontendApp(page);
    await frontend.goto();
    await frontend.expectCrossOriginIsolated();

    await frontend.expectServiceWorkerActivates();
  }
);
