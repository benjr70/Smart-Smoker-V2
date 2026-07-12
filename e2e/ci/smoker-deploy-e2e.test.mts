/**
 * Validation test for wiring the `virtual-smoker` Playwright project into the
 * Smoker Deploy workflow (issue #321). GitHub Actions cannot run locally, so
 * this drives TDD by asserting the parsed workflow YAML:
 *
 *   AC1  a job runs the temp-chain (virtual-smoker) project AFTER the deploy job
 *        (which contains the existing shallow smoke probe)
 *   AC2  the run aims the smoker UI + device-service emulator at the
 *        virtual-smoker box (8080 / 3003) and the frontend + backend at dev-cloud
 *   AC4  the run is blocking (no continue-on-error) so a failed temp-chain is
 *        visible, and Playwright trace + HTML report upload as artifacts on
 *        failure
 *   AC5  hermetic PR gate, prod-deploy, and dev-deploy's deployed target are
 *        unaffected
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import YAML from 'yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');
const smokerDeployPath = resolve(repoRoot, '.github/workflows/smoker-deploy.yml');
const raw = readFileSync(smokerDeployPath, 'utf8');
const doc = YAML.parse(raw) as Record<string, any>;

type Step = Record<string, any>;

const RUNS_VIRTUAL_SMOKER = /test:virtual-smoker|--project=virtual-smoker/;

/** The job whose steps run the virtual-smoker Playwright project. */
function findVirtualSmokerE2eJob(): { name: string; job: any } {
  for (const [name, job] of Object.entries<any>(doc.jobs ?? {})) {
    const steps: Step[] = (job?.steps ?? []) as Step[];
    if (steps.some(s => typeof s.run === 'string' && RUNS_VIRTUAL_SMOKER.test(s.run))) {
      return { name, job };
    }
  }
  throw new Error('no job runs the virtual-smoker Playwright project');
}

describe('smoker-deploy runs the virtual-smoker temp-chain e2e (issue #321)', () => {
  it('AC1: a job runs the virtual-smoker Playwright project', () => {
    const { job } = findVirtualSmokerE2eJob();
    const steps: Step[] = job.steps as Step[];
    const runs = steps.some(s => typeof s.run === 'string' && RUNS_VIRTUAL_SMOKER.test(s.run));
    assert.ok(runs, 'must run the virtual-smoker project');
  });

  it('AC1: the temp-chain e2e runs after the deploy job (and its shallow probe)', () => {
    const { job } = findVirtualSmokerE2eJob();
    const needs = ([] as string[]).concat(job.needs ?? []);
    assert.ok(needs.includes('deploy'), 'temp-chain e2e job must need the deploy job');
  });

  it('AC1: selects the virtual-smoker target', () => {
    const { name } = findVirtualSmokerE2eJob();
    const jobText = raw.slice(raw.indexOf(`${name}:`));
    assert.match(jobText, /E2E_TARGET:\s*virtual-smoker/, 'must select the virtual-smoker target');
  });

  it('AC2: aims smoker + device at the box and frontend + backend at dev-cloud', () => {
    const { name } = findVirtualSmokerE2eJob();
    const jobText = raw.slice(raw.indexOf(`${name}:`));
    // resolveTarget requires all four URLs for a non-hermetic target.
    for (const key of ['E2E_FRONTEND_URL', 'E2E_BACKEND_URL', 'E2E_SMOKER_URL', 'E2E_DEVICE_URL']) {
      assert.ok(jobText.includes(key), `must supply ${key}`);
    }
    // Smoker UI + device-service emulator are published on the box.
    const smokerLine = jobText.match(/E2E_SMOKER_URL:.*/)?.[0] ?? '';
    const deviceLine = jobText.match(/E2E_DEVICE_URL:.*/)?.[0] ?? '';
    assert.match(smokerLine, /:8080/, 'smoker UI must point at the box port 8080');
    assert.match(deviceLine, /:3003/, 'device-service emulator must point at the box port 3003');
    // Frontend + backend are the dev-cloud stack the box writes to.
    const frontendLine = jobText.match(/E2E_FRONTEND_URL:.*/)?.[0] ?? '';
    const backendLine = jobText.match(/E2E_BACKEND_URL:.*/)?.[0] ?? '';
    assert.match(backendLine, /:8443/, 'backend must be the dev-cloud stack (HTTPS 8443)');
    assert.ok(
      /dev-cloud|DEV_CLOUD/.test(frontendLine),
      'frontend must resolve to the dev-cloud host'
    );
    assert.ok(
      /dev-cloud|DEV_CLOUD/.test(backendLine),
      'backend must resolve to the dev-cloud host'
    );
  });

  it('AC4: the temp-chain run is blocking (no continue-on-error)', () => {
    const { job } = findVirtualSmokerE2eJob();
    const steps: Step[] = job.steps as Step[];
    const runStep = steps.find(s => typeof s.run === 'string' && RUNS_VIRTUAL_SMOKER.test(s.run));
    assert.notEqual(
      runStep?.['continue-on-error'],
      true,
      'temp-chain e2e must fail the run so a broken deploy is visible'
    );
  });

  it('AC4: uploads Playwright trace + HTML report on failure', () => {
    const { job } = findVirtualSmokerE2eJob();
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

  it('AC4: connectivity vs spec failures are distinguishable (global-setup preflight)', () => {
    // The suite's global setup waits for every service health endpoint before a
    // spec runs, so an unreachable box surfaces as a preflight/connectivity
    // failure (named services), not a misleading in-spec assertion.
    const setup = readFileSync(resolve(repoRoot, 'e2e/src/global-setup.ts'), 'utf8');
    assert.match(setup, /waitForHealthy/, 'global setup must preflight service health');
  });
});

describe('other workflows are unaffected by the virtual-smoker wiring (issue #321)', () => {
  it('AC5: prod-deploy does not run any deployed/virtual-smoker journey project', () => {
    const prod = readFileSync(resolve(repoRoot, '.github/workflows/prod-deploy.yml'), 'utf8');
    assert.ok(
      !prod.includes('test:virtual-smoker'),
      'prod-deploy must not run test:virtual-smoker'
    );
    assert.ok(!prod.includes('--project=virtual-smoker'), 'prod-deploy must not run the project');
    assert.ok(!prod.includes('E2E_TARGET'), 'prod-deploy must not set E2E_TARGET');
  });

  it('AC5: the hermetic PR gate does not select the virtual-smoker target', () => {
    const gate = readFileSync(resolve(repoRoot, '.github/workflows/e2e-pr-gate.yml'), 'utf8');
    assert.ok(!gate.includes('virtual-smoker'), 'PR gate must stay hermetic');
  });

  it("AC5: dev-deploy's deployed target is unchanged (still the no-temp deployed project)", () => {
    const devDeploy = readFileSync(resolve(repoRoot, '.github/workflows/dev-deploy.yml'), 'utf8');
    assert.match(devDeploy, /E2E_TARGET:\s*deployed/, 'dev-deploy must keep the deployed target');
    assert.ok(
      !devDeploy.includes('test:virtual-smoker'),
      'dev-deploy must not run the temp-chain project'
    );
  });
});
