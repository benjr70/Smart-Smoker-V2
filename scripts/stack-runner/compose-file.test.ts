/**
 * Unit tests for compose-file resolution — behavior 3 of issue #328.
 *
 * The runner uses the branch's own copy of the e2e compose file when present,
 * and falls back to the master copy (materialised from git) when the checked-out
 * branch predates it.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveComposeFile, type ComposeFileDeps } from './compose-file.ts';

const BRANCH_PATH = '/repo/e2e/docker/docker-compose.e2e.yml';

describe('resolveComposeFile — behavior 3 (branch vs master fallback)', () => {
  it('uses the branch copy when it exists on the checkout', () => {
    const deps: ComposeFileDeps = {
      branchPath: BRANCH_PATH,
      exists: () => true,
      materializeMaster: () => {
        throw new Error('should not materialize master when branch copy exists');
      },
    };
    const result = resolveComposeFile(deps);
    assert.equal(result.source, 'branch');
    assert.equal(result.path, BRANCH_PATH);
  });

  it('falls back to a materialised master copy when the branch copy is absent', () => {
    let materialized = 0;
    const deps: ComposeFileDeps = {
      branchPath: BRANCH_PATH,
      exists: () => false,
      materializeMaster: () => {
        materialized += 1;
        return '/tmp/stack-runner-master/docker-compose.e2e.yml';
      },
    };
    const result = resolveComposeFile(deps);
    assert.equal(result.source, 'master');
    assert.equal(result.path, '/tmp/stack-runner-master/docker-compose.e2e.yml');
    assert.equal(materialized, 1);
  });

  it('checks existence of the branch path specifically', () => {
    const checked: string[] = [];
    const deps: ComposeFileDeps = {
      branchPath: BRANCH_PATH,
      exists: p => {
        checked.push(p);
        return true;
      },
      materializeMaster: () => 'unused',
    };
    resolveComposeFile(deps);
    assert.deepEqual(checked, [BRANCH_PATH]);
  });
});
