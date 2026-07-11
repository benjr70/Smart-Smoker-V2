/**
 * Unit tests for the test-entity prefix helpers (issue #319, behavior 1).
 *
 * These are the data-hygiene safety net: everything the fixture creates carries
 * the `smoke-test-` prefix, and `cleanup()`/`sweep()` may only ever act on names
 * that carry it. If prefix matching were ever loose enough to select a real
 * (non-prefixed) record, a sweep would delete production data — so these tests
 * hammer the edge cases: empty names, partial matches, and lookalike prefixes.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  TEST_ENTITY_PREFIX,
  isTestEntityName,
  selectTestEntities,
  testEntityName,
} from './test-entity.ts';

describe('isTestEntityName', () => {
  it('accepts a name that starts with the smoke-test- prefix', () => {
    assert.equal(isTestEntityName(`${TEST_ENTITY_PREFIX}brisket`), true);
  });

  it('accepts the bare prefix on its own', () => {
    assert.equal(isTestEntityName(TEST_ENTITY_PREFIX), true);
  });

  it('rejects non-prefixed real-looking names', () => {
    for (const realName of [
      'Brisket Prep',
      'Sunday Ribs',
      'test',
      'smoke',
      'production-smoke-test', // prefix appears, but not at the start
      ' smoke-test-leading-space', // leading whitespace shifts the prefix
      'Smoke-Test-Brisket', // wrong case
      'smoke_test_brisket', // underscores, not the hyphen prefix
      'smoke-tests-brisket', // lookalike: smoke-test*s*-
      'smoke-test', // one char short of the full prefix (no trailing hyphen)
    ]) {
      assert.equal(
        isTestEntityName(realName),
        false,
        `must not match: ${JSON.stringify(realName)}`
      );
    }
  });

  it('rejects empty and non-string inputs', () => {
    for (const bad of ['', undefined, null, 0, 42, {}, [], NaN, true]) {
      assert.equal(isTestEntityName(bad), false, `must not match: ${JSON.stringify(bad)}`);
    }
  });
});

describe('testEntityName', () => {
  it('always produces a name that carries the prefix and is therefore sweepable', () => {
    const name = testEntityName('brisket');

    assert.ok(name.startsWith(TEST_ENTITY_PREFIX));
    assert.equal(isTestEntityName(name), true);
    assert.match(name, /brisket/);
  });

  it('produces a unique name on every call so parallel runs never collide', () => {
    const names = new Set(Array.from({ length: 100 }, () => testEntityName('ribs')));

    assert.equal(names.size, 100);
  });

  it('produces a prefixed name even when given no label', () => {
    assert.equal(isTestEntityName(testEntityName()), true);
  });
});

describe('selectTestEntities', () => {
  interface Row {
    _id: string;
    name?: string | null;
  }

  it('returns only the prefixed rows and never touches real data', () => {
    const rows: Row[] = [
      { _id: '1', name: `${TEST_ENTITY_PREFIX}alpha` },
      { _id: '2', name: 'Real Brisket' },
      { _id: '3', name: `${TEST_ENTITY_PREFIX}beta` },
      { _id: '4', name: 'smoke-test' }, // lookalike, one char short
      { _id: '5', name: '' },
      { _id: '6', name: null },
      { _id: '7' }, // name absent entirely
    ];

    const selected = selectTestEntities(rows, row => row.name);

    assert.deepEqual(
      selected.map(r => r._id),
      ['1', '3']
    );
  });

  it('returns an empty list when nothing is prefixed', () => {
    const rows: Row[] = [
      { _id: 'a', name: 'Sunday Ribs' },
      { _id: 'b', name: 'Monday Pork' },
    ];

    assert.deepEqual(
      selectTestEntities(rows, row => row.name),
      []
    );
  });
});
