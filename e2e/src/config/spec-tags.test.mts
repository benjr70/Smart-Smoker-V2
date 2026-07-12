/**
 * Spec-tag inventory guard (issue #321, behavior 1).
 *
 * The `virtual-smoker` Playwright project runs by grepping the
 * `@virtual-smoker` tag (see playwright-projects.ts). That grep only reaches the
 * temp-chain journey if the journey spec actually carries the tag, so this test
 * pins the file-level contract without booting Playwright:
 *
 *   - the temp-chain (lifecycle) spec is tagged `@virtual-smoker` so the
 *     post-deploy virtual-smoker run drives the live temperature pipeline;
 *   - the no-temp `@deployed` secondary flows are NOT tagged `@virtual-smoker`
 *     (they have no smoker relay to exercise on the box).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { DEPLOYED_TAG, VIRTUAL_SMOKER_TAG } from './playwright-projects.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const testsDir = resolve(__dirname, '..', '..', 'tests');

const read = (name: string) => readFileSync(resolve(testsDir, name), 'utf8');

describe('virtual-smoker spec tags (issue #321)', () => {
  it('tags the temp-chain lifecycle spec so the virtual-smoker project selects it', () => {
    const lifecycle = read('lifecycle.spec.ts');
    assert.ok(
      lifecycle.includes(VIRTUAL_SMOKER_TAG),
      'the temp-chain lifecycle spec must be tagged @virtual-smoker'
    );
  });

  it('does not tag the no-temp @deployed flows as @virtual-smoker', () => {
    for (const name of [
      'history-review.spec.ts',
      'ratings.spec.ts',
      'delete.spec.ts',
      'settings.spec.ts',
    ]) {
      const spec = read(name);
      assert.ok(spec.includes(DEPLOYED_TAG), `${name} should stay @deployed`);
      assert.ok(
        !spec.includes(VIRTUAL_SMOKER_TAG),
        `${name} must not run against the virtual-smoker box (no smoker relay)`
      );
    }
  });
});
