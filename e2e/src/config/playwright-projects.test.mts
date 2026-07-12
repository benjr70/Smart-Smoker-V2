import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DEPLOYED_TAG, VIRTUAL_SMOKER_TAG, buildProjectFilter } from './playwright-projects.ts';

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
    assert.equal(buildProjectFilter('virtual-smoker').name, 'virtual-smoker');
  });

  it('deployed target greps for the @deployed tag and nothing else', () => {
    const { grep } = buildProjectFilter('deployed');
    assert.ok(grep, 'deployed project must carry a grep filter');
    assert.ok(grep.test(`lifecycle history review ${DEPLOYED_TAG}`), 'must select tagged specs');
    assert.ok(!grep.test('lifecycle temperature relay'), 'must skip untagged (temp) specs');
  });

  it('virtual-smoker target greps for the @virtual-smoker tag and nothing else', () => {
    const { grep } = buildProjectFilter('virtual-smoker');
    assert.ok(grep, 'virtual-smoker project must carry a grep filter');
    assert.ok(
      grep.test(`lifecycle temperature relay ${VIRTUAL_SMOKER_TAG}`),
      'must select the temp-chain journey'
    );
    // The no-temp @deployed journeys have no smoker app on dev-cloud to relay
    // through, so the virtual-smoker project must not pick them up.
    assert.ok(
      !grep.test(`history review ${DEPLOYED_TAG}`),
      'must skip the @deployed-only journeys'
    );
  });

  it('deployed and virtual-smoker tags do not cross-select each other', () => {
    const deployedGrep = buildProjectFilter('deployed').grep;
    const virtualGrep = buildProjectFilter('virtual-smoker').grep;
    assert.ok(deployedGrep && virtualGrep);
    // A temp-chain spec tagged @virtual-smoker must not run in the deployed
    // (dev-cloud, no smoker) project.
    assert.ok(!deployedGrep.test(`temp-chain ${VIRTUAL_SMOKER_TAG}`));
    // A no-temp spec tagged @deployed must not run in the virtual-smoker project.
    assert.ok(!virtualGrep.test(`history ${DEPLOYED_TAG}`));
  });

  it('hermetic target runs the whole suite (no grep filter)', () => {
    assert.equal(buildProjectFilter('hermetic').grep, undefined);
  });
});
