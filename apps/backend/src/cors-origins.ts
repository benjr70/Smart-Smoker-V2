/**
 * The browser origins allowed to call this API.
 *
 * The deployed topology is fixed, so the allowlist is a literal list. Hermetic
 * stacks are not: a per-PR stack (PRD #327 verify-pr harness) publishes the
 * frontend and smoker UIs on remapped host ports, so their origins are unknown
 * at build time and are supplied at boot via `CORS_EXTRA_ORIGINS` (a
 * comma-separated list). Without them a host browser loads the per-PR UI fine
 * but every cross-origin REST response is blocked — and because the websocket
 * gateway allows `*`, live temps keep flowing, which makes the failure look like
 * a partial success rather than a CORS problem.
 */

/** Origins of the known, deployed frontends. */
export const STATIC_CORS_ORIGINS: readonly string[] = [
  // Production cloud (accessed via Tailscale Serve HTTPS)
  'https://smokecloud.tail74646.ts.net',
  'https://smokecloud.tail74646.ts.net:8443',
  // Dev cloud (accessed via Tailscale Serve HTTPS; renamed from
  // smoker-dev-cloud in PR #262)
  'https://smart-smoker-dev-cloud.tail74646.ts.net',
  'https://smart-smoker-dev-cloud.tail74646.ts.net:8443',
  // Smoker devices (direct HTTP - no Tailscale Serve). On the device
  // itself the app loads from localhost/short name; the post-deploy e2e
  // browser reaches the same UI over the tailnet FQDN, so both origin
  // spellings must be allowed.
  'http://virtual-smoker:8080',
  'http://virtual-smoker.tail74646.ts.net:8080',
  'http://smoker:8080',
  'http://smoker.tail74646.ts.net:8080',
  // Local development
  'http://localhost:8080',
  'http://localhost:3000',
];

/** Env var carrying additional origins, comma-separated. */
export const EXTRA_ORIGINS_VAR = 'CORS_EXTRA_ORIGINS';

/**
 * The full allowlist: the static origins plus any configured extras, in order
 * and without duplicates. With no extras configured the result is exactly
 * {@link STATIC_CORS_ORIGINS}.
 */
export function resolveCorsOrigins(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const extras = (env[EXTRA_ORIGINS_VAR] ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  return [...new Set([...STATIC_CORS_ORIGINS, ...extras])];
}
