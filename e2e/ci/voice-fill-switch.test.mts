/**
 * Guard on the switch that turns Voice Fill's scripted models on (issue #711).
 *
 * The Voice Fill journeys run on a scripted speech model, a scripted extractor
 * and a downloader that fetches nothing. A bundle only allows them when it was
 * built with `REACT_APP_VOICE_FILL_SCRIPTED=true` in the env file webpack bakes
 * in, so the switch is as safe as the env files are:
 *
 *   - the hermetic e2e stack's env file carries the key, or the journeys have
 *     no Voice Fill to drive;
 *   - nothing that builds a published image does — the publish workflow writes
 *     its env file itself, and no workflow and no committed production env file
 *     may name the key.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');

const SWITCH = 'REACT_APP_VOICE_FILL_SCRIPTED';

const read = (path: string) => readFileSync(resolve(repoRoot, path), 'utf8');

describe('the scripted Voice Fill switch (issue #711)', () => {
  it('is on in the bundle the hermetic e2e stack builds', () => {
    assert.match(read('e2e/docker/frontend.e2e.env'), new RegExp(`^${SWITCH}=true$`, 'm'));
  });

  it('is named by no workflow, so no published image is built with it', () => {
    const workflows = readdirSync(resolve(repoRoot, '.github/workflows'));
    assert.ok(workflows.includes('publish.yml'), 'the publish workflow must be among those read');
    for (const workflow of workflows) {
      assert.ok(
        !read(`.github/workflows/${workflow}`).includes(SWITCH),
        `${workflow} must not set ${SWITCH}`
      );
    }
  });

  it('is not in the production env file committed beside the frontend', () => {
    assert.ok(
      !read('apps/frontend/.env.prod').includes(SWITCH),
      `apps/frontend/.env.prod must not set ${SWITCH}`
    );
  });
});
