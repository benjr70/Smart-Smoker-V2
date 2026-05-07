/**
 * Hostname guard test — issue #189
 *
 * Asserts that the codebase has no bare dev-cloud hostname literal (without a
 * numeric `-N` suffix) inside the workflow / infra / script / verify-deploy
 * paths. The dev-cloud peer name lives in the GitHub repo variable
 * `DEV_CLOUD_HOST`; runtime resolution uses `scripts/smoke/resolve-host.ts`
 * (#187). Bare literals defeat both.
 *
 * The fixed-string needle below is assembled from non-adjacent pieces so that
 * the AC6 grep `git grep -nF '<base>' | grep -v '<base>-1'` does not flag this
 * test file itself. The same trick is applied in `resolve-host.test.ts`.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..', '..');

const DEV_CLOUD_BASE = 'smoker-dev' + '-cloud';
const ALLOWED_SUFFIX = `${DEV_CLOUD_BASE}-1`;

describe('hostname-guard (issue #189)', () => {
  it('AC6: no bare dev-cloud literal in workflow / infra / script / verify-deploy paths', async () => {
    let stdout = '';
    try {
      const result = await execFileAsync(
        'git',
        [
          'grep',
          '-nF',
          DEV_CLOUD_BASE,
          '--',
          '.github/workflows/',
          'infra/',
          'scripts/',
          '.claude/skills/verify-deploy/',
        ],
        { cwd: repoRoot, maxBuffer: 10 * 1024 * 1024 },
      );
      stdout = result.stdout;
    } catch (err) {
      const e = err as { code?: number; stdout?: string };
      if (e.code === 1) {
        stdout = e.stdout ?? '';
      } else {
        throw err;
      }
    }

    const offending = stdout
      .split('\n')
      .filter(line => line.length > 0)
      .filter(line => !line.includes(ALLOWED_SUFFIX));

    assert.equal(
      offending.length,
      0,
      `Bare dev-cloud literal (no -N suffix) must not appear in workflow / infra / script / verify-deploy paths. ` +
        `Use \${{ vars.DEV_CLOUD_HOST }} (workflows) or the canonical -1 suffix.\n` +
        `Offending lines:\n${offending.join('\n')}`,
    );
  });
});
