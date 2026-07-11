/**
 * Unit tests for CLI argument parsing (pure). The CLI wires these into the
 * real docker/fs side effects in cli.ts.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs } from './cli-args.ts';

describe('parseArgs', () => {
  it('parses `up --pr 328`', () => {
    const parsed = parseArgs(['up', '--pr', '328']);
    assert.equal(parsed.command, 'up');
    assert.equal(parsed.prNumber, 328);
    assert.equal(parsed.projectName, undefined);
  });

  it('parses `down --pr 328`', () => {
    const parsed = parseArgs(['down', '--pr', '328']);
    assert.equal(parsed.command, 'down');
    assert.equal(parsed.prNumber, 328);
  });

  it('parses `down --project <name>` without a PR number', () => {
    const parsed = parseArgs(['down', '--project', 'smoker-pr-328']);
    assert.equal(parsed.command, 'down');
    assert.equal(parsed.projectName, 'smoker-pr-328');
    assert.equal(parsed.prNumber, undefined);
  });

  it('accepts --pr=328 equals form', () => {
    const parsed = parseArgs(['up', '--pr=328']);
    assert.equal(parsed.prNumber, 328);
  });

  it('throws on an unknown subcommand', () => {
    assert.throws(() => parseArgs(['sideways', '--pr', '1']));
  });

  it('throws when no subcommand is given', () => {
    assert.throws(() => parseArgs([]));
  });

  it('throws on a non-numeric --pr', () => {
    assert.throws(() => parseArgs(['up', '--pr', 'abc']));
  });

  it('throws when up is given neither --pr nor --project', () => {
    assert.throws(() => parseArgs(['up']));
  });
});
