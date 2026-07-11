/**
 * Unit tests for the up/down orchestrator — behaviors 4 (down idempotency) and
 * 5 (failed-up cleanup) of issue #328. No docker: the command runner and health
 * wait are injected. Behavior 6 (real docker end-to-end) is verified manually on
 * the box.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { up, down, type CommandRunner, type CommandResult, type UpDeps } from './stack-runner.ts';
import { computeStackConfig } from './stack-config.ts';
import type { ComposeDocument } from './derive-compose.ts';

interface RecordedCall {
  cmd: string;
  args: string[];
}

/** Build a runner that records calls and returns a code chosen per-invocation. */
function recordingRunner(
  codeFor: (call: RecordedCall) => number,
  calls: RecordedCall[]
): CommandRunner {
  return async (cmd, args): Promise<CommandResult> => {
    const call = { cmd, args };
    calls.push(call);
    return { stdout: '', stderr: '', code: codeFor(call) };
  };
}

const isUpCommand = (c: RecordedCall): boolean => c.args.includes('up');
const isDownCommand = (c: RecordedCall): boolean => c.args.includes('down');

const BASE_DOC: ComposeDocument = {
  name: 'smart-smoker-e2e',
  services: {
    mongo: {},
    backend: { build: { context: '../..', dockerfile: 'e2e/docker/stack.Dockerfile' } },
    'device-service': { build: { context: '../..' } },
    frontend: { build: { context: '../..' } },
    smoker: { build: { context: '../..' } },
  },
};

function makeUpDeps(overrides: Partial<UpDeps>): UpDeps {
  return {
    config: computeStackConfig(328),
    composePath: '/repo/e2e/docker/docker-compose.e2e.yml',
    baseDir: '/repo/e2e/docker',
    loadCompose: () => structuredClone(BASE_DOC),
    writeDerived: () => '/tmp/derived/docker-compose.smoker-pr-328.yml',
    runner: recordingRunner(() => 0, []),
    waitForHealthy: async () => undefined,
    log: () => undefined,
    ...overrides,
  };
}

describe('down — behavior 4 (idempotency)', () => {
  it('tears down with the project name, removing volumes', async () => {
    const calls: RecordedCall[] = [];
    const runner = recordingRunner(() => 0, calls);
    const result = await down('smoker-pr-328', runner);
    assert.equal(result.code, 0);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].cmd, 'docker');
    assert.ok(calls[0].args.includes('-p'));
    assert.ok(calls[0].args.includes('smoker-pr-328'));
    assert.ok(calls[0].args.includes('down'));
    assert.ok(calls[0].args.includes('-v'), 'down must remove volumes');
  });

  it('is a zero-exit no-op when the project does not exist (run twice)', async () => {
    const calls: RecordedCall[] = [];
    // Real `docker compose -p <unknown> down -v` exits 0 with nothing to remove.
    const runner = recordingRunner(() => 0, calls);
    const first = await down('smoker-pr-999', runner);
    const second = await down('smoker-pr-999', runner);
    assert.equal(first.code, 0);
    assert.equal(second.code, 0);
  });

  it('surfaces a real teardown failure as a thrown error', async () => {
    const runner = recordingRunner(() => 1, []);
    await assert.rejects(() => down('smoker-pr-328', runner));
  });

  it('validates the project name', async () => {
    const runner = recordingRunner(() => 0, []);
    await assert.rejects(() => down('', runner));
  });
});

describe('up — happy path (no docker, injected runner)', () => {
  it('builds + starts detached against the derived file under the project name', async () => {
    const calls: RecordedCall[] = [];
    const runner = recordingRunner(() => 0, calls);
    const result = await up(makeUpDeps({ runner }));

    assert.equal(result.projectName, 'smoker-pr-328');
    const upCall = calls.find(isUpCommand);
    assert.ok(upCall, 'expected an up command');
    assert.ok(upCall!.args.includes('--build'), 'up must build images from the checkout');
    assert.ok(upCall!.args.includes('-d'), 'up must run detached');
    assert.ok(upCall!.args.includes('-p'));
    assert.ok(upCall!.args.includes('smoker-pr-328'));
    assert.ok(upCall!.args.includes('/tmp/derived/docker-compose.smoker-pr-328.yml'));
  });

  it('does not tear down on success', async () => {
    const calls: RecordedCall[] = [];
    const runner = recordingRunner(() => 0, calls);
    await up(makeUpDeps({ runner }));
    assert.equal(calls.some(isDownCommand), false);
  });
});

describe('up — behavior 5 (cleanup on failure)', () => {
  it('tears down and rejects when the compose up command fails', async () => {
    const calls: RecordedCall[] = [];
    const runner = recordingRunner(c => (isUpCommand(c) ? 1 : 0), calls);
    await assert.rejects(() => up(makeUpDeps({ runner })));

    const downCall = calls.find(isDownCommand);
    assert.ok(downCall, 'a failed up must trigger a teardown');
    assert.ok(downCall!.args.includes('smoker-pr-328'));
    assert.ok(downCall!.args.includes('-v'), 'cleanup must remove volumes, leaving no orphans');
  });

  it('tears down and rejects when services never become healthy', async () => {
    const calls: RecordedCall[] = [];
    const runner = recordingRunner(() => 0, calls);
    await assert.rejects(() =>
      up(
        makeUpDeps({
          runner,
          waitForHealthy: async () => {
            throw new Error('timed out waiting for health');
          },
        })
      )
    );
    assert.ok(calls.some(isDownCommand), 'unhealthy boot must be cleaned up');
  });
});
