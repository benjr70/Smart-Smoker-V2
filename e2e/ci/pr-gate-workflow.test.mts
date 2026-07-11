/**
 * Validation test for the blocking e2e PR-gate GitHub Actions workflow
 * (issue #316). GitHub Actions cannot run locally, so this test drives TDD by
 * asserting the parsed workflow YAML honours every acceptance criterion:
 *
 *   AC1  path-filtered PR trigger (apps / packages / e2e / Dockerfile / compose)
 *        with no catch-all — docs/infra-only PRs skip the gate
 *   AC2  blocking, not advisory (no `continue-on-error`)
 *   AC3  Playwright trace + HTML report uploaded as artifacts on failure
 *   AC4  Docker layer caching configured (type=gha cache-from/cache-to)
 *   AC5  compose logs dumped to the job output on failure
 *
 * It also pins the security posture (narrow permissions) and the retries=2
 * contract inherited from the slice-1 Playwright config.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import YAML from 'yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');
const workflowPath = resolve(repoRoot, '.github/workflows/e2e-pr-gate.yml');

const raw = readFileSync(workflowPath, 'utf8');
const doc = YAML.parse(raw) as Record<string, any>;

// `on` is a bare string key under the YAML 1.2 core schema, but guard against
// parsers that fold it to boolean `true`.
const triggers = doc.on ?? doc[true as unknown as string];

type Step = Record<string, any>;
const allSteps: Step[] = Object.values(doc.jobs ?? {}).flatMap(
  (job: any) => (job?.steps ?? []) as Step[]
);

describe('e2e PR-gate workflow (issue #316)', () => {
  it('AC1: triggers on pull_request with a path allowlist, no catch-all', () => {
    assert.ok(triggers?.pull_request, 'must trigger on pull_request');
    const paths: string[] = triggers.pull_request.paths ?? [];
    assert.ok(paths.length > 0, 'pull_request must be path-filtered');

    for (const needle of ['apps/**', 'packages/**', 'e2e/**']) {
      assert.ok(paths.includes(needle), `path filter must include ${needle}`);
    }
    assert.ok(
      paths.some(p => p.includes('docker-compose')),
      'path filter must include compose files'
    );
    assert.ok(
      paths.some(p => p.toLowerCase().includes('dockerfile')),
      'path filter must include Dockerfiles'
    );
    assert.ok(
      paths.some(p => p.includes('.github/workflows/e2e-pr-gate.yml')),
      'workflow must re-trigger on changes to itself'
    );

    // docs/infra-only PRs must skip: no catch-all, no docs/infra entries.
    assert.ok(!paths.includes('**'), 'must not use a catch-all path');
    assert.ok(
      !paths.some(p => p.startsWith('docs/') || p.startsWith('infra/')),
      'docs/infra paths must not be part of the allowlist'
    );
  });

  it('AC2: blocking — no continue-on-error anywhere', () => {
    // Ignore comment lines so the header's prose ("no continue-on-error") does
    // not mask a real directive.
    const directives = raw
      .split('\n')
      .filter(line => !line.trim().startsWith('#'))
      .join('\n');
    assert.ok(!directives.includes('continue-on-error'), 'gate must be blocking, not advisory');
    for (const step of allSteps) {
      assert.notEqual(step['continue-on-error'], true, 'no step may set continue-on-error: true');
    }
  });

  it('AC2: runs the hermetic Playwright project with retries=2', () => {
    const runsHermetic = allSteps.some(
      s =>
        typeof s.run === 'string' &&
        (s.run.includes('test:hermetic') || s.run.includes('--project=hermetic'))
    );
    assert.ok(runsHermetic, 'must run the hermetic Playwright project');

    // retries=2 is inherited from the slice-1 config; assert it still holds.
    const cfg = readFileSync(resolve(repoRoot, 'e2e/playwright.config.ts'), 'utf8');
    assert.match(cfg, /retries:\s*2/, 'Playwright retries must be 2');
  });

  it('AC3: uploads Playwright trace + HTML report as artifacts on failure', () => {
    const uploads = allSteps.filter(s =>
      String(s.uses ?? '').startsWith('actions/upload-artifact')
    );
    assert.ok(uploads.length > 0, 'must upload artifacts');

    const uploadText = JSON.stringify(uploads);
    assert.ok(uploadText.includes('playwright-report'), 'must upload the HTML report');
    assert.ok(uploadText.includes('test-results'), 'must upload traces (test-results)');
    assert.ok(
      uploads.some(s => String(s.if ?? '').includes('failure')),
      'artifact upload must run on failure'
    );
  });

  it('AC4: Docker layer caching is configured (type=gha)', () => {
    assert.ok(raw.includes('type=gha'), 'must use the gha cache backend');
    assert.ok(raw.includes('cache-from'), 'must read from the layer cache');
    assert.ok(raw.includes('cache-to'), 'must write to the layer cache');
  });

  it('AC5: compose logs are dumped to the job output on failure', () => {
    const dump = allSteps.find(
      s =>
        String(s.if ?? '').includes('failure') &&
        typeof s.run === 'string' &&
        s.run.includes('compose') &&
        s.run.includes('logs')
    );
    assert.ok(dump, 'a failure() step must dump compose logs');
  });

  it('tears the stack down after the run (always)', () => {
    const teardown = allSteps.find(
      s =>
        String(s.if ?? '').includes('always') &&
        typeof s.run === 'string' &&
        s.run.includes('compose') &&
        s.run.includes('down')
    );
    assert.ok(teardown, 'an always() step must tear the compose stack down');
  });

  it('scopes permissions narrowly (contents: read)', () => {
    assert.equal(doc.permissions?.contents, 'read', 'top-level permissions must be contents: read');
  });
});
