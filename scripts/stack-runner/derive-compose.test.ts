/**
 * Unit tests for derive-compose — the pure transform that turns the shared e2e
 * compose document into a per-PR-isolated one (supports AC 1 & 2 of issue #328).
 *
 * The transform never mutates the shared compose file on disk; it produces a new
 * document with per-project container names, remapped host ports, an absolutised
 * build context, and a published mongo port.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { parse, stringify } from 'yaml';
import { deriveComposeDocument, type ComposeDocument } from './derive-compose.ts';
import { computeStackConfig } from './stack-config.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');
const realComposePath = join(repoRoot, 'e2e', 'docker', 'docker-compose.e2e.yml');
const baseDir = join(repoRoot, 'e2e', 'docker');

function loadRealCompose(): ComposeDocument {
  return parse(readFileSync(realComposePath, 'utf-8')) as ComposeDocument;
}

describe('deriveComposeDocument — per-PR isolation transform', () => {
  const config = computeStackConfig(328);

  it('gives every service a per-project container name', () => {
    const derived = deriveComposeDocument(loadRealCompose(), config, baseDir);
    const services = derived.services;
    assert.equal(services.mongo.container_name, 'smoker-pr-328-mongo');
    assert.equal(services.backend.container_name, 'smoker-pr-328-backend');
    assert.equal(services['device-service'].container_name, 'smoker-pr-328-device-service');
    assert.equal(services.frontend.container_name, 'smoker-pr-328-frontend');
    assert.equal(services.smoker.container_name, 'smoker-pr-328-smoker');
  });

  it('remaps published host ports onto the allocated block, keeping container ports', () => {
    const derived = deriveComposeDocument(loadRealCompose(), config, baseDir);
    const services = derived.services;
    assert.deepEqual(services.backend.ports, [`${config.ports.backend}:3001`]);
    assert.deepEqual(services['device-service'].ports, [`${config.ports.device}:3003`]);
    assert.deepEqual(services.frontend.ports, [`${config.ports.frontend}:3000`]);
    assert.deepEqual(services.smoker.ports, [`${config.ports.smoker}:8080`]);
  });

  it('publishes mongo on its allocated host port (base file publishes none)', () => {
    const derived = deriveComposeDocument(loadRealCompose(), config, baseDir);
    assert.deepEqual(derived.services.mongo.ports, [`${config.ports.mongo}:27017`]);
  });

  it('replaces rather than appends ports so concurrent PRs never fight over 3001', () => {
    const derived = deriveComposeDocument(loadRealCompose(), config, baseDir);
    const backendPorts = derived.services.backend.ports as string[];
    assert.equal(backendPorts.length, 1);
    assert.equal(
      backendPorts.some(p => p.startsWith('3001:')),
      false
    );
  });

  it('absolutises the build context so the derived file can live in a temp dir', () => {
    const derived = deriveComposeDocument(loadRealCompose(), config, baseDir);
    const build = derived.services.backend.build as { context: string; dockerfile: string };
    assert.equal(build.context, resolve(baseDir, '../..'));
    // dockerfile stays relative to the (now absolute) context.
    assert.equal(build.dockerfile, 'e2e/docker/stack.Dockerfile');
  });

  it('drops the top-level project name so the -p flag governs the project', () => {
    const derived = deriveComposeDocument(loadRealCompose(), config, baseDir);
    assert.equal('name' in derived, false);
  });

  it('preserves depends_on health ordering untouched', () => {
    const derived = deriveComposeDocument(loadRealCompose(), config, baseDir);
    assert.deepEqual(derived.services.frontend.depends_on, {
      backend: { condition: 'service_healthy' },
    });
  });

  it('does not mutate the input document', () => {
    const original = loadRealCompose();
    const snapshot = JSON.stringify(original);
    deriveComposeDocument(original, config, baseDir);
    assert.equal(JSON.stringify(original), snapshot);
  });

  it('bakes the remapped backend URLs into the smoker image via build args', () => {
    const derived = deriveComposeDocument(loadRealCompose(), config, baseDir);
    const build = derived.services.smoker.build as { args?: Record<string, string> };
    assert.equal(build.args?.SMOKER_CLOUD_URL, `http://localhost:${config.ports.backend}`);
    assert.equal(build.args?.SMOKER_CLOUD_URL_API, `http://localhost:${config.ports.backend}/api/`);
  });

  it('only emits build args the hermetic image build declares', () => {
    const dockerfile = readFileSync(join(baseDir, 'stack.Dockerfile'), 'utf-8');
    const derived = deriveComposeDocument(loadRealCompose(), config, baseDir);
    const emitted = Object.keys(derived.services.smoker.build?.args ?? {});
    assert.ok(emitted.length > 0, 'expected the smoker service to receive build args');
    for (const name of emitted) {
      assert.match(
        dockerfile,
        new RegExp(`^ARG ${name}(=|$)`, 'm'),
        `stack.Dockerfile declares no ARG ${name}, so the build would silently ignore it`
      );
    }
  });

  it('leaves services that bake no host URLs without build args', () => {
    const derived = deriveComposeDocument(loadRealCompose(), config, baseDir);
    for (const serviceName of ['backend', 'device-service', 'frontend']) {
      const build = derived.services[serviceName].build as Record<string, unknown>;
      assert.equal('args' in build, false, `${serviceName} should not have gained build args`);
    }
  });

  it('leaves the shared e2e compose file arg-free so the default stack build is unchanged', () => {
    const build = loadRealCompose().services.smoker.build as Record<string, unknown>;
    assert.equal(
      'args' in build,
      false,
      'the default e2e stack must build the smoker with the static env only — ' +
        'per-PR URLs belong in the derived document, not the shared file'
    );
  });

  it('round-trips the build args through YAML so compose reads the remapped URLs', () => {
    const derived = deriveComposeDocument(loadRealCompose(), config, baseDir);
    const reloaded = parse(stringify(derived)) as ComposeDocument;
    assert.deepEqual(reloaded.services.smoker.build?.args, {
      SMOKER_CLOUD_URL: `http://localhost:${config.ports.backend}`,
      SMOKER_CLOUD_URL_API: `http://localhost:${config.ports.backend}/api/`,
    });
  });
});
