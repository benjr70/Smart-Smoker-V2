import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { backendLogLines, hermeticStoreReady, mongoEval, type Shell } from './hermetic-store.ts';

/** Records what was asked of docker, and answers with a canned reply. */
const shellThat = (reply: string | (() => string)) => {
  const calls: { file: string; args: string[] }[] = [];
  const shell: Shell = (file, args) => {
    calls.push({ file, args });
    return typeof reply === 'function' ? reply() : reply;
  };
  return { shell, calls };
};

describe('hermeticStoreReady', () => {
  it('is ready when both containers of the stack are running', () => {
    const { shell, calls } = shellThat('true\ntrue\n');

    assert.equal(hermeticStoreReady(shell), true);
    assert.deepEqual(calls[0].args.slice(0, 2), ['inspect', '-f']);
  });

  it('is not ready when one of them is stopped', () => {
    const { shell } = shellThat('true\nfalse\n');

    assert.equal(hermeticStoreReady(shell), false);
  });

  /** No docker, or no such container: the spec that needs one is skipped. */
  it('is not ready when docker cannot answer at all', () => {
    const { shell } = shellThat(() => {
      throw new Error('command not found: docker');
    });

    assert.equal(hermeticStoreReady(shell), false);
  });
});

describe('mongoEval', () => {
  it('runs the script against the stack database and answers with its output', () => {
    const { shell, calls } = shellThat('  3\n');

    assert.equal(mongoEval('db.temps.countDocuments({})', shell), '3');
    assert.deepEqual(calls[0].args, [
      'exec',
      'e2e-mongo',
      'mongosh',
      'smartsmoker',
      '--quiet',
      '--eval',
      'db.temps.countDocuments({})',
    ]);
  });
});

describe('backendLogLines', () => {
  it('answers with only the logged lines that mention what was asked for', () => {
    const { shell } = shellThat(
      ['boot', 'TempSeriesBackfill put 1 first reading(s) back', 'ready'].join('\n')
    );

    assert.deepEqual(backendLogLines('TempSeriesBackfill', shell), [
      'TempSeriesBackfill put 1 first reading(s) back',
    ]);
  });

  it('answers with nothing when the logs mention it never', () => {
    const { shell } = shellThat('boot\nready\n');

    assert.deepEqual(backendLogLines('TempSeriesBackfill', shell), []);
  });
});
