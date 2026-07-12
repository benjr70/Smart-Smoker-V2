import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DEPLOYED_TAG, buildProjectFilter } from './playwright-projects.ts';

/**
 * The deployed Playwright project must run *only* the specs tagged for a
 * deployed stack (the no-temp journeys — dev-cloud has no smoker app to relay
 * temps), while the hermetic project runs the whole suite. That selection is
 * expressed as a grep filter on the project, extracted here so it is unit
 * testable without booting Playwright or a stack.
 */
describe('buildProjectFilter', () => {
  it('names the project after the resolved target', () => {
    assert.equal(buildProjectFilter('hermetic').name, 'hermetic');
    assert.equal(buildProjectFilter('deployed').name, 'deployed');
  });

  it('deployed target greps for the @deployed tag and nothing else', () => {
    const { grep } = buildProjectFilter('deployed');
    assert.ok(grep, 'deployed project must carry a grep filter');
    assert.ok(grep.test(`lifecycle history review ${DEPLOYED_TAG}`), 'must select tagged specs');
    assert.ok(!grep.test('lifecycle temperature relay'), 'must skip untagged (temp) specs');
  });

  it('hermetic target runs the whole suite (no grep filter)', () => {
    assert.equal(buildProjectFilter('hermetic').grep, undefined);
  });
});
