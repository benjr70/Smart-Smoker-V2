import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import {
  backendLogLines,
  hermeticStoreReady,
  mongoEval,
  sweepPlantedCooks,
  type Shell,
} from './hermetic-store.ts';

/** Records what was asked of docker, and answers with a canned reply. */
const shellThat = (reply: string | ((args: string[]) => string)) => {
  const calls: { file: string; args: string[] }[] = [];
  const shell: Shell = (file, args) => {
    calls.push({ file, args });
    return typeof reply === 'function' ? reply(args) : reply;
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
  it('answers with the store output, trimmed of the shell newline', () => {
    const { shell } = shellThat('  3\n');

    assert.equal(mongoEval('db.temps.countDocuments({})', shell), '3');
  });

  it('runs the script the caller gave it, against the stack database', () => {
    const { shell, calls } = shellThat('');

    mongoEval('db.temps.countDocuments({})', shell);

    assert.equal(calls[0].args.at(-1), 'db.temps.countDocuments({})');
    assert.ok(calls[0].args.includes('smartsmoker'));
  });
});

describe('sweepPlantedCooks', () => {
  /**
   * The guarantee that matters: every target but the composed stack is a real
   * archive, and the sweep deletes by date rather than by a `smoke-test-` name
   * — so it must not reach a store it does not own. Nothing is run at all,
   * rather than run against whatever `docker` happens to resolve to.
   */
  it('runs nothing where there is no hermetic store to sweep', () => {
    const { shell, calls } = shellThat(() => {
      throw new Error('command not found: docker');
    });

    assert.equal(sweepPlantedCooks(shell), '0 0');
    assert.equal(
      calls.filter(call => call.args.includes('mongosh')).length,
      0,
      'the store must not be spoken to'
    );
  });

  it('answers with what the store says it removed', () => {
    const { shell, calls } = shellThat(args =>
      args.includes('inspect') ? 'true\ntrue\n' : '2 6\n'
    );

    assert.equal(sweepPlantedCooks(shell), '2 6');
    const swept = calls.find(call => call.args.includes('mongosh'));
    assert.ok(swept, 'the store is swept once it is there to sweep');
    assert.match(String(swept?.args.at(-1)), /db\.smokes\.deleteMany/);
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
