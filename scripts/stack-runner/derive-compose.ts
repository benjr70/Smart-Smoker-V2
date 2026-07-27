/**
 * Transform the shared e2e compose document into a per-PR-isolated derivative.
 *
 * Docker compose *merges* (concatenates) `ports` lists across `-f` overlays, so
 * an override file cannot remap the base file's hard-coded host ports — it would
 * only add a second publish and two concurrent PRs would still fight over 3001.
 * Instead the runner reads the base file and produces a *complete* derived
 * document with:
 *   - a per-project `container_name` for every service (base uses fixed
 *     `e2e-*` names that would collide across projects),
 *   - `ports` fully replaced with the PR's allocated host ports,
 *   - a published host port for mongo (the base publishes none),
 *   - the relative `build.context` absolutised so the derived file can be
 *     written to a temp dir and still build from the checkout,
 *   - build args carrying the remapped host URLs for the one image that bakes
 *     them in at compile time (the smoker web bundle),
 *   - the per-PR browser origins handed to the backend so its CORS allowlist
 *     accepts them,
 *   - the base file's fixed `image` tag removed from every built service so
 *     compose tags each stack's build `<project>-<service>` instead of two
 *     concurrent stacks racing on one shared tag,
 *   - the top-level `name` removed so the `-p` project flag governs.
 *
 * Pure transform: it clones its input and never touches the shared file on disk.
 */
import { resolve } from 'node:path';
import { resolveStackUrls, type StackConfig } from './stack-config.ts';

/** A parsed compose service. Only the keys we touch are typed; the rest ride along. */
export interface ComposeService {
  container_name?: string;
  ports?: string[];
  image?: string;
  environment?: string[] | Record<string, string>;
  build?: { context?: string; dockerfile?: string; args?: Record<string, string> } & Record<
    string,
    unknown
  >;
  [key: string]: unknown;
}

/** A parsed compose document. */
export interface ComposeDocument {
  name?: string;
  services: Record<string, ComposeService>;
  [key: string]: unknown;
}

/** Maps each stack service to its in-container port and the config port key. */
interface ServiceMapping {
  containerPort: number;
  portKey: keyof StackConfig['ports'];
  /** Build args this service's image needs to bake the remapped host URLs in. */
  buildArgs?: (config: StackConfig) => Record<string, string>;
  /** Runtime env vars this service needs to know about the remapped host ports. */
  environment?: (config: StackConfig) => Record<string, string>;
}

/**
 * The smoker web bundle bakes its host URLs at image-build time (dotenv-webpack
 * over a static env file that assumes the default host ports). A per-PR stack
 * publishes those services somewhere else entirely, so the derived document
 * hands the remapped host URLs to the image build, which overrides the static
 * values before webpack runs.
 *
 * Both hops the browser makes are covered: the cloud backend (REST + socket) and
 * the device-service temp socket. Nothing else the smoker talks to is baked in.
 */
function smokerBuildArgs(config: StackConfig): Record<string, string> {
  const urls = resolveStackUrls(config);
  return {
    SMOKER_CLOUD_URL: urls.backend,
    SMOKER_CLOUD_URL_API: `${urls.backend}/api/`,
    SMOKER_DEVICE_URL: urls.device,
  };
}

/**
 * The backend's CORS allowlist is a fixed list of known origins (dev defaults +
 * tailnet FQDNs) — a per-PR stack serves its UIs on remapped ports, so without
 * this every cross-origin REST response from a host browser is blocked (the
 * websocket gateway allows `*`, which makes the failure look partial). The
 * backend appends `CORS_EXTRA_ORIGINS` to its static list at boot.
 */
function backendEnvironment(config: StackConfig): Record<string, string> {
  const urls = resolveStackUrls(config);
  return { CORS_EXTRA_ORIGINS: [urls.smoker, urls.frontend].join(',') };
}

const SERVICE_MAP: Record<string, ServiceMapping> = {
  mongo: { containerPort: 27017, portKey: 'mongo' },
  backend: { containerPort: 3001, portKey: 'backend', environment: backendEnvironment },
  'device-service': { containerPort: 3003, portKey: 'device' },
  frontend: { containerPort: 3000, portKey: 'frontend' },
  smoker: { containerPort: 8080, portKey: 'smoker', buildArgs: smokerBuildArgs },
};

/**
 * Merge `additions` into a compose `environment` block, honouring either
 * notation (the `KEY=value` list the e2e file uses, or the mapping form) and
 * replacing rather than duplicating an existing key.
 */
function mergeEnvironment(
  existing: ComposeService['environment'],
  additions: Record<string, string>
): ComposeService['environment'] {
  if (existing && !Array.isArray(existing)) {
    return { ...existing, ...additions };
  }
  const kept = (existing ?? []).filter(
    entry => !Object.keys(additions).some(key => entry.startsWith(`${key}=`))
  );
  return [...kept, ...Object.entries(additions).map(([key, value]) => `${key}=${value}`)];
}

/**
 * Produce the per-PR compose document. `baseDir` is the directory the base
 * compose file's relative `build.context` resolves against (i.e.
 * `<repoRoot>/e2e/docker`), used to absolutise it.
 */
export function deriveComposeDocument(
  base: ComposeDocument,
  config: StackConfig,
  baseDir: string
): ComposeDocument {
  const clone = structuredClone(base) as ComposeDocument;
  delete clone.name;

  for (const [serviceName, mapping] of Object.entries(SERVICE_MAP)) {
    const service = clone.services[serviceName];
    if (!service) {
      throw new Error(
        `derive-compose: base compose file is missing expected service "${serviceName}"`
      );
    }

    service.container_name = `${config.projectName}-${serviceName}`;

    const hostPort = config.ports[mapping.portKey];
    service.ports = [`${hostPort}:${mapping.containerPort}`];

    if (service.build && typeof service.build.context === 'string') {
      service.build = {
        ...service.build,
        context: resolve(baseDir, service.build.context),
      };
    }

    if (service.build && mapping.buildArgs) {
      service.build = {
        ...service.build,
        args: { ...service.build.args, ...mapping.buildArgs(config) },
      };
    }

    // A built image's *content* is per-PR (the smoker bakes this stack's URLs
    // in), so it must not share the base file's fixed tag: compose resolves that
    // tag when it creates the container, and a concurrent stack's build could
    // retag it in between, silently serving the other PR's bundle. Dropping
    // `image` makes compose tag the build `<project>-<service>`, which is also
    // what `down --rmi local` reclaims.
    if (service.build) {
      delete service.image;
    }

    if (mapping.environment) {
      service.environment = mergeEnvironment(service.environment, mapping.environment(config));
    }
  }

  return clone;
}
