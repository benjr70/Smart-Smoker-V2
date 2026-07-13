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
 *   - the top-level `name` removed so the `-p` project flag governs.
 *
 * Pure transform: it clones its input and never touches the shared file on disk.
 */
import { resolve } from 'node:path';
import type { StackConfig } from './stack-config.ts';

/** A parsed compose service. Only the keys we touch are typed; the rest ride along. */
export interface ComposeService {
  container_name?: string;
  ports?: string[];
  build?: { context?: string; dockerfile?: string } & Record<string, unknown>;
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
}

const SERVICE_MAP: Record<string, ServiceMapping> = {
  mongo: { containerPort: 27017, portKey: 'mongo' },
  backend: { containerPort: 3001, portKey: 'backend' },
  'device-service': { containerPort: 3003, portKey: 'device' },
  frontend: { containerPort: 3000, portKey: 'frontend' },
  smoker: { containerPort: 8080, portKey: 'smoker' },
};

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
  }

  return clone;
}
