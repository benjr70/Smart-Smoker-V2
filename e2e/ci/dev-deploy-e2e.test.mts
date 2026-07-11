/**
 * Validation test for wiring the `deployed` Playwright project into the
 * Dev Deploy workflow (issue #320, behavior 3). GitHub Actions cannot run
 * locally, so this drives TDD by asserting the parsed workflow YAML:
 *
 *   AC3  a job runs the deployed project AFTER the dev-cloud deploy, against
 *        env-supplied dev-cloud URLs (E2E_TARGET=deployed + per-service URLs)
 *   AC3  the run is blocking (no continue-on-error) so a failed deployed spec
 *        is visible in the workflow run
 *   AC3  Playwright trace + HTML report are uploaded as artifacts on failure
 *   AC5  prod-deploy workflow is NOT touched by this wiring
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import YAML from 'yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');
const devDeployPath = resolve(repoRoot, '.github/workflows/dev-deploy.yml');
const raw = readFileSync(devDeployPath, 'utf8');
const doc = YAML.parse(raw) as Record<string, any>;

type Step = Record<string, any>;

/** The job whose steps run the deployed Playwright project. */
function findDeployedE2eJob(): { name: string; job: any } {
  for (const [name, job] of Object.entries<any>(doc.jobs ?? {})) {
    const steps: Step[] = (job?.steps ?? []) as Step[];
    if (
      steps.some(s => typeof s.run === 'string' && /test:deployed|--project=deployed/.test(s.run))
    ) {
      return { name, job };
    }
  }
  throw new Error('no job runs the deployed Playwright project');
}

describe('dev-deploy runs the deployed e2e project (issue #320)', () => {
  it('AC3: a job runs the deployed Playwright project', () => {
    const { job } = findDeployedE2eJob();
    const steps: Step[] = job.steps as Step[];
    const runsDeployed = steps.some(
      s => typeof s.run === 'string' && /test:deployed|--project=deployed/.test(s.run)
    );
    assert.ok(runsDeployed, 'must run the deployed project');
  });

  it('AC3: the deployed e2e runs after the dev-cloud deploy', () => {
    const { job } = findDeployedE2eJob();
    const needs = ([] as string[]).concat(job.needs ?? []);
    assert.ok(needs.includes('deploy-dev-cloud'), 'deployed e2e job must need deploy-dev-cloud');
  });

  it('AC3: aims the deployed project at env-supplied dev-cloud URLs', () => {
    const { name } = findDeployedE2eJob();
    // Scope the raw scan to the job block so we assert on this job's config.
    const jobText = raw.slice(raw.indexOf(`${name}:`));
    assert.match(jobText, /E2E_TARGET:\s*deployed/, 'must select the deployed target');
    for (const key of ['E2E_FRONTEND_URL', 'E2E_BACKEND_URL', 'E2E_SMOKER_URL', 'E2E_DEVICE_URL']) {
      assert.ok(jobText.includes(key), `must supply ${key} (resolveTarget requires all four)`);
    }
  });

  it('AC3: the deployed run is blocking (no continue-on-error)', () => {
    const { job } = findDeployedE2eJob();
    const steps: Step[] = job.steps as Step[];
    const runStep = steps.find(
      s => typeof s.run === 'string' && /test:deployed|--project=deployed/.test(s.run)
    );
    assert.notEqual(
      runStep?.['continue-on-error'],
      true,
      'deployed e2e must fail the run so a broken deploy is visible'
    );
  });

  it('AC3: uploads Playwright trace + HTML report on failure', () => {
    const { job } = findDeployedE2eJob();
    const steps: Step[] = job.steps as Step[];
    const uploads = steps.filter(s => String(s.uses ?? '').startsWith('actions/upload-artifact'));
    assert.ok(uploads.length > 0, 'must upload artifacts');
    const uploadText = JSON.stringify(uploads);
    assert.ok(uploadText.includes('playwright-report'), 'must upload the HTML report');
    assert.ok(uploadText.includes('test-results'), 'must upload traces (test-results)');
    assert.ok(
      uploads.some(s => /failure|always/.test(String(s.if ?? ''))),
      'artifact upload must run on failure'
    );
  });
});

describe('prod-deploy is untouched by the deployed e2e wiring (issue #320)', () => {
  it('AC5: prod-deploy workflow does not run the deployed e2e project', () => {
    const prod = readFileSync(resolve(repoRoot, '.github/workflows/prod-deploy.yml'), 'utf8');
    assert.ok(!prod.includes('test:deployed'), 'prod-deploy must not run test:deployed');
    assert.ok(
      !prod.includes('--project=deployed'),
      'prod-deploy must not run the deployed project'
    );
    assert.ok(!prod.includes('E2E_TARGET'), 'prod-deploy must not set E2E_TARGET');
  });
});
