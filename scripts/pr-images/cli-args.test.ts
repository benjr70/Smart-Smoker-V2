/**
 * Unit tests for pr-images CLI argument parsing (pure). The CLI binds these to
 * the real Chrome profile + GitHub session in cli.ts.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs, DEFAULT_REPO, DEFAULT_TIMEOUT_MS } from './cli-args.ts';

describe('parseArgs', () => {
  it('parses `upload --pr 440 a.png b.png`', () => {
    const parsed = parseArgs(['upload', '--pr', '440', 'a.png', 'b.png']);
    assert.equal(parsed.command, 'upload');
    assert.equal(parsed.prNumber, 440);
    assert.deepEqual(parsed.files, ['a.png', 'b.png']);
    assert.equal(parsed.repo, DEFAULT_REPO);
    assert.equal(parsed.timeoutMs, DEFAULT_TIMEOUT_MS);
    assert.equal(parsed.headful, false);
  });

  it('accepts the --pr=440 equals form', () => {
    assert.equal(parseArgs(['upload', '--pr=440', 'a.png']).prNumber, 440);
  });

  it('keeps file order — captions are paired positionally', () => {
    const parsed = parseArgs(['upload', '--pr', '1', 'z.png', 'a.png', 'm.png']);
    assert.deepEqual(parsed.files, ['z.png', 'a.png', 'm.png']);
  });

  it('parses login and status without a PR', () => {
    assert.equal(parseArgs(['login']).command, 'login');
    assert.equal(parseArgs(['status']).command, 'status');
  });

  it('takes an explicit profile dir and repo', () => {
    const parsed = parseArgs([
      'upload',
      '--pr',
      '5',
      '--repo',
      'octo/cat',
      '--profile',
      '/var/lib/gh-profile',
      'a.png',
    ]);
    assert.equal(parsed.repo, 'octo/cat');
    assert.equal(parsed.profileDir, '/var/lib/gh-profile');
  });

  it('takes a custom timeout and --headful', () => {
    const parsed = parseArgs(['upload', '--pr', '5', '--timeout', '30000', '--headful', 'a.png']);
    assert.equal(parsed.timeoutMs, 30000);
    assert.equal(parsed.headful, true);
  });

  it('rejects an unknown command', () => {
    assert.throws(() => parseArgs(['post']), /unknown command/);
    assert.throws(() => parseArgs([]), /unknown command/);
  });

  it('rejects an unknown flag rather than treating it as a file', () => {
    assert.throws(() => parseArgs(['upload', '--pr', '1', '--wat', 'a.png']), /unknown flag/);
  });

  it('requires --pr and at least one file for upload', () => {
    assert.throws(() => parseArgs(['upload', 'a.png']), /requires --pr/);
    assert.throws(() => parseArgs(['upload', '--pr', '440']), /at least one image/);
  });

  it('rejects a non-numeric or negative --pr', () => {
    assert.throws(() => parseArgs(['upload', '--pr', 'abc', 'a.png']), /positive integer/);
    assert.throws(() => parseArgs(['upload', '--pr', '-3', 'a.png']), /positive integer/);
  });

  it('rejects a malformed --repo', () => {
    assert.throws(
      () => parseArgs(['upload', '--pr', '1', '--repo', 'nope', 'a.png']),
      /owner\/name/
    );
  });

  it('rejects a flag whose value is missing', () => {
    assert.throws(() => parseArgs(['upload', '--pr', '1', '--profile']), /expects a value/);
  });
});
