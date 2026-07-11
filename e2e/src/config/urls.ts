/**
 * Base-URL resolution for the e2e suite.
 *
 * The hermetic docker compose publishes every service on the runner host, so
 * the defaults point at localhost. `localhost` (not `127.0.0.1`) is deliberate:
 * the backend's CORS allow-list and the smoker's baked build env are keyed to
 * the `localhost` origin, and the two must match for the smoker page to reach
 * the backend during the temperature relay.
 *
 * Every value can be overridden from the environment so later slices can aim
 * the same specs at deployed targets.
 */
export interface E2eUrls {
  /** React web frontend (nginx, proxies /api + /socket.io to the backend). */
  frontend: string;
  /** Smoker touchscreen app served as a web page. */
  smoker: string;
  /** NestJS API + websocket gateway. */
  backend: string;
  /** Device-service serial/emulator bridge + websocket gateway. */
  device: string;
}

const DEFAULTS: E2eUrls = {
  frontend: 'http://localhost:3000',
  smoker: 'http://localhost:8080',
  backend: 'http://localhost:3001',
  device: 'http://localhost:3003',
};

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

export function resolveUrls(env: NodeJS.ProcessEnv = process.env): E2eUrls {
  return {
    frontend: stripTrailingSlash(env.E2E_FRONTEND_URL ?? DEFAULTS.frontend),
    smoker: stripTrailingSlash(env.E2E_SMOKER_URL ?? DEFAULTS.smoker),
    backend: stripTrailingSlash(env.E2E_BACKEND_URL ?? DEFAULTS.backend),
    device: stripTrailingSlash(env.E2E_DEVICE_URL ?? DEFAULTS.device),
  };
}

export const urls = resolveUrls();
