/**
 * Hostname guard test — issue #189
 *
 * Asserts that the codebase has no legacy dev-cloud hostname literal inside the
 * workflow / infra / script / verify-deploy paths. The canonical dev-cloud peer
 * name is `smart-smoker-dev-cloud` (also the GitHub repo variable
 * `DEV_CLOUD_HOST`); runtime resolution uses `scripts/smoke/resolve-host.ts`
 * (#187). The legacy un-prefixed form (and its numeric `-1` variant) must not
 * reappear — it no longer resolves on the tailnet.
 *
 * The fixed-string needle below is assembled from non-adjacent pieces so that
 * the AC6 grep `git grep -nF '<legacy base>'` does not flag this test file
 * itself. The same trick is applied in `resolve-host.test.ts`.
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

// Legacy (forbidden) base name and the canonical (allowed) form. Any line
// containing the legacy base that is NOT part of the canonical `smart-` name is
// a violation.
const LEGACY_BASE = 'smoker-dev' + '-cloud';
const CANONICAL = 'smart-' + LEGACY_BASE; // smart-smoker-dev-cloud

describe('hostname-guard (issue #189)', () => {
  it('AC6: no legacy dev-cloud literal in workflow / infra / script / verify-deploy paths', async () => {
    let stdout = '';
    try {
      const result = await execFileAsync(
        'git',
        [
          'grep',
          '-nF',
          LEGACY_BASE,
          '--',
          '.github/workflows/',
          'infra/',
          'scripts/',
          '.claude/skills/verify-deploy/',
        ],
        { cwd: repoRoot, maxBuffer: 10 * 1024 * 1024 }
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
      .filter(line => !line.includes(CANONICAL));

    assert.equal(
      offending.length,
      0,
      `Legacy dev-cloud literal (missing the "smart-" prefix) must not appear in ` +
        `workflow / infra / script / verify-deploy paths. ` +
        `Use \${{ vars.DEV_CLOUD_HOST }} (workflows) or the canonical ${CANONICAL}.\n` +
        `Offending lines:\n${offending.join('\n')}`
    );
  });
});
