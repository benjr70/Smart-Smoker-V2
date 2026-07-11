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
import { parse } from 'yaml';
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
});
