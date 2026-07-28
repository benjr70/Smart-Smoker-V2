/**
 * Unit tests for `e2e/docker/bake-smoker-env.sh` — the per-PR env bake the
 * hermetic smoker image build runs before webpack.
 *
 * This logic used to live inline in a `stack.Dockerfile` RUN, where it was only
 * exercisable by building the image. It is a real seam: it decides the URLs the
 * smoker web bundle compiles in, and getting it wrong produces a *silently*
 * wrong bundle rather than a failed build. Extracting it to a script makes the
 * contract testable at the same level the compose derivation already is.
 *
 * The script is executed for real via `sh` against temp fixtures — the behavior
 * under test is text manipulation of a file, so there is nothing worth faking.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');
const scriptPath = join(repoRoot, 'e2e', 'docker', 'bake-smoker-env.sh');

/** Write `contents` to a fresh temp env file and return its path. */
function givenEnvFile(contents: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'bake-smoker-env-'));
  const file = join(dir, '.env.prod');
  writeFileSync(file, contents);
  return file;
}

/** Run the bake script over `file` with `KEY=VALUE` assignments. */
function bake(file: string, ...assignments: string[]): void {
  execFileSync('sh', [scriptPath, file, ...assignments], { stdio: 'pipe' });
}

describe('bake-smoker-env.sh — per-PR smoker env bake', () => {
  it('replaces the value of a key the env file already defines', () => {
    const file = givenEnvFile(
      'ENV=e2e\nREACT_APP_CLOUD_URL=http://localhost:3001\nREACT_APP_CLOUD_URL_API=http://localhost:3001/api/\n'
    );

    bake(file, 'REACT_APP_CLOUD_URL=http://localhost:20011');

    assert.equal(
      readFileSync(file, 'utf-8'),
      'ENV=e2e\nREACT_APP_CLOUD_URL=http://localhost:20011\nREACT_APP_CLOUD_URL_API=http://localhost:3001/api/\n'
    );
  });

  it('appends a key the env file does not define yet', () => {
    const file = givenEnvFile('ENV=e2e\nREACT_APP_CLOUD_URL=http://localhost:3001\n');

    bake(file, 'REACT_APP_DEVICE_URL=http://localhost:20012');

    assert.equal(
      readFileSync(file, 'utf-8'),
      'ENV=e2e\nREACT_APP_CLOUD_URL=http://localhost:3001\nREACT_APP_DEVICE_URL=http://localhost:20012\n'
    );
  });

  // The shipped `apps/smoker/.env.prod` has no trailing newline; the hermetic
  // build only escapes this because `stack.Dockerfile` overwrites that file with
  // `smoker.e2e.env`, which happens to end in one. The naive `>>` append this
  // replaced glued the new assignment onto the last line, destroying the previous
  // URL and leaving the new key undefined — and webpack still exits 0, so the
  // stack would serve a silently misconfigured bundle.
  it('appends to a file with no trailing newline without joining the last line', () => {
    const file = givenEnvFile('ENV=e2e\nREACT_APP_CLOUD_URL=http://localhost:3001');

    bake(file, 'REACT_APP_DEVICE_URL=http://localhost:20012');

    assert.equal(
      readFileSync(file, 'utf-8'),
      'ENV=e2e\nREACT_APP_CLOUD_URL=http://localhost:3001\nREACT_APP_DEVICE_URL=http://localhost:20012\n'
    );
  });

  // The image build always passes all three assignments, sourced from build args
  // that default to empty. An empty value means "this stack did not remap that
  // service", so the statically-compiled default must survive — blanking it would
  // bake an empty origin into the bundle.
  it('leaves a key untouched when its assigned value is empty', () => {
    const file = givenEnvFile('ENV=e2e\nREACT_APP_CLOUD_URL=http://localhost:3001\n');

    bake(file, 'REACT_APP_CLOUD_URL=', 'REACT_APP_DEVICE_URL=');

    assert.equal(
      readFileSync(file, 'utf-8'),
      'ENV=e2e\nREACT_APP_CLOUD_URL=http://localhost:3001\n'
    );
  });

  it('keeps everything after the first equals sign as the value', () => {
    const file = givenEnvFile('REACT_APP_CLOUD_URL=http://localhost:3001\n');

    bake(file, 'REACT_APP_CLOUD_URL=http://localhost:20011/?a=1&b=2');

    assert.equal(
      readFileSync(file, 'utf-8'),
      'REACT_APP_CLOUD_URL=http://localhost:20011/?a=1&b=2\n'
    );
  });

  // REACT_APP_CLOUD_URL is a strict prefix of REACT_APP_CLOUD_URL_API, so a
  // prefix-matching upsert would rewrite the wrong line.
  it('does not touch a longer key that starts with the key being set', () => {
    const file = givenEnvFile(
      'REACT_APP_CLOUD_URL=http://localhost:3001\nREACT_APP_CLOUD_URL_API=http://localhost:3001/api/\n'
    );

    bake(file, 'REACT_APP_CLOUD_URL=http://localhost:20011');

    assert.equal(
      readFileSync(file, 'utf-8'),
      'REACT_APP_CLOUD_URL=http://localhost:20011\nREACT_APP_CLOUD_URL_API=http://localhost:3001/api/\n'
    );
  });

  // The whole point of the script: the exact call the smoker image build makes.
  it('bakes a full per-PR URL set, replacing the two cloud keys and adding the device key', () => {
    const file = givenEnvFile(
      'ENV=e2e\nREACT_APP_CLOUD_URL=http://localhost:3001\nREACT_APP_CLOUD_URL_API=http://localhost:3001/api/\n'
    );

    bake(
      file,
      'REACT_APP_CLOUD_URL=http://localhost:20011',
      'REACT_APP_CLOUD_URL_API=http://localhost:20011/api/',
      'REACT_APP_DEVICE_URL=http://localhost:20012'
    );

    assert.equal(
      readFileSync(file, 'utf-8'),
      'ENV=e2e\n' +
        'REACT_APP_CLOUD_URL=http://localhost:20011\n' +
        'REACT_APP_CLOUD_URL_API=http://localhost:20011/api/\n' +
        'REACT_APP_DEVICE_URL=http://localhost:20012\n'
    );
  });
});

/**
 * The tests above only mean something if the image build actually runs this
 * script. Extracting the logic out of the Dockerfile is worthless if a copy of
 * it survives inline, so pin both halves of the wiring.
 */
describe('stack.Dockerfile — smoker env bake wiring', () => {
  const dockerfile = readFileSync(join(repoRoot, 'e2e', 'docker', 'stack.Dockerfile'), 'utf-8');

  it('copies the bake script into the smoker build stage', () => {
    assert.match(dockerfile, /^COPY e2e\/docker\/bake-smoker-env\.sh /m);
  });

  it('bakes the env by invoking the script, not an inline copy of its logic', () => {
    assert.match(dockerfile, /bake-smoker-env\.sh apps\/smoker\/\.env\.prod/);
    assert.doesNotMatch(
      dockerfile,
      /upsert\(\)/,
      'the inline upsert must be gone, or the tested script is dead code'
    );
  });

  it('passes every build arg it declares through to the bake script', () => {
    for (const [arg, key] of [
      ['SMOKER_CLOUD_URL', 'REACT_APP_CLOUD_URL'],
      ['SMOKER_CLOUD_URL_API', 'REACT_APP_CLOUD_URL_API'],
      ['SMOKER_DEVICE_URL', 'REACT_APP_DEVICE_URL'],
    ]) {
      assert.match(
        dockerfile,
        new RegExp(`"${key}=\\$${arg}"`),
        `build arg ${arg} is declared but never baked as ${key}`
      );
    }
  });
});
