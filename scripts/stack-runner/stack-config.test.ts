/**
 * Unit tests for stack-config — deterministic per-PR project name / port
 * allocation and the stdout emission contract.
 *
 * Zero-dependency node:test + assert/strict, run via `tsx --test`.
 * Behaviors 1 (naming/ports) and 2 (stdout contract) from issue #328.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeStackConfig,
  formatStackOutput,
  RESERVED_DEV_PORTS,
  isReservedDevPort,
  type StackConfig,
} from './stack-config.ts';

describe('computeStackConfig — behavior 1 (naming + ports)', () => {
  it('derives a lowercase per-PR compose project name from the PR number', () => {
    const config = computeStackConfig(328);
    assert.equal(config.projectName, 'smoker-pr-328');
    // Compose project names must be lowercase alnum + dashes.
    assert.match(config.projectName, /^[a-z0-9][a-z0-9_-]*$/);
  });

  it('is deterministic — same PR number yields a deep-equal config', () => {
    assert.deepEqual(computeStackConfig(328), computeStackConfig(328));
  });

  it('assigns every published host port outside the reserved dev range', () => {
    const config = computeStackConfig(328);
    const ports = Object.values(config.ports);
    assert.equal(ports.length, 5);
    for (const port of ports) {
      assert.equal(
        isReservedDevPort(port),
        false,
        `port ${port} collides with a reserved dev port`
      );
    }
  });

  it('gives distinct PR numbers distinct project names and port blocks', () => {
    const a = computeStackConfig(328);
    const b = computeStackConfig(329);
    assert.notEqual(a.projectName, b.projectName);
    const aPorts = new Set(Object.values(a.ports));
    for (const port of Object.values(b.ports)) {
      assert.equal(aPorts.has(port), false, `port ${port} shared across PRs 328/329`);
    }
  });

  it('never assigns two services the same host port within one stack', () => {
    const config = computeStackConfig(328);
    const ports = Object.values(config.ports);
    assert.equal(new Set(ports).size, ports.length);
  });

  it('rejects non-positive-integer PR numbers', () => {
    assert.throws(() => computeStackConfig(0));
    assert.throws(() => computeStackConfig(-1));
    assert.throws(() => computeStackConfig(1.5));
  });
});

describe('isReservedDevPort — behavior 1 (reserved range)', () => {
  it('flags the dev defaults 3000-3003 and mongo/smoker dev ports', () => {
    for (const port of RESERVED_DEV_PORTS) {
      assert.equal(isReservedDevPort(port), true);
    }
  });

  it('does not flag high alternate-range ports', () => {
    assert.equal(isReservedDevPort(20001), false);
  });
});

describe('formatStackOutput — behavior 2 (stdout contract)', () => {
  const config: StackConfig = computeStackConfig(328);
  const output = formatStackOutput(config);
  const lines = output.trimEnd().split('\n');
  const map = new Map(lines.map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));

  it('emits one KEY=value line per service URL plus mongo and project', () => {
    assert.deepEqual([...map.keys()].sort(), [
      'E2E_BACKEND_URL',
      'E2E_DEVICE_URL',
      'E2E_FRONTEND_URL',
      'E2E_MONGO_URL',
      'E2E_SMOKER_URL',
      'STACK_PROJECT_NAME',
    ]);
  });

  it('points every service URL at localhost on its allocated host port', () => {
    assert.equal(map.get('E2E_FRONTEND_URL'), `http://localhost:${config.ports.frontend}`);
    assert.equal(map.get('E2E_BACKEND_URL'), `http://localhost:${config.ports.backend}`);
    assert.equal(map.get('E2E_DEVICE_URL'), `http://localhost:${config.ports.device}`);
    assert.equal(map.get('E2E_SMOKER_URL'), `http://localhost:${config.ports.smoker}`);
  });

  it('emits a hermetic mongo connection string on the allocated host port', () => {
    assert.equal(map.get('E2E_MONGO_URL'), `mongodb://localhost:${config.ports.mongo}/smartsmoker`);
  });

  it('emits the compose project name for teardown', () => {
    assert.equal(map.get('STACK_PROJECT_NAME'), config.projectName);
  });

  it('is stable/parseable — no blank or malformed lines', () => {
    for (const line of lines) {
      assert.match(line, /^[A-Z0-9_]+=.+$/);
    }
  });
});
