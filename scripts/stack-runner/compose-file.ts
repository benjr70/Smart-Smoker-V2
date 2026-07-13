/**
 * Resolve which copy of the e2e compose file to drive.
 *
 * Normally the branch checkout carries its own
 * `e2e/docker/docker-compose.e2e.yml`. Older branches predate PRD #314 and
 * lack it; for those the runner materialises the master copy (via `git show`)
 * into a temp file and uses that, so the stack can still boot.
 *
 * The resolution logic is pure and injectable (behavior 3 of issue #328); the
 * default wiring performs the real filesystem + git side effects.
 */
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

/** Path, relative to the repo root, of the canonical e2e compose file. */
export const COMPOSE_REPO_PATH = 'e2e/docker/docker-compose.e2e.yml';

export type ComposeSource = 'branch' | 'master';

export interface ComposeResolution {
  /** Absolute path to the compose file to hand to `docker compose -f`. */
  path: string;
  source: ComposeSource;
}

export interface ComposeFileDeps {
  /** Absolute path where the branch's compose file would live. */
  branchPath: string;
  /** Existence probe (injected for tests; defaults to fs.existsSync). */
  exists: (path: string) => boolean;
  /** Writes the master copy somewhere and returns its absolute path. */
  materializeMaster: () => string;
}

/**
 * Pick the branch copy when present, else fall back to a materialised master
 * copy.
 */
export function resolveComposeFile(deps: ComposeFileDeps): ComposeResolution {
  if (deps.exists(deps.branchPath)) {
    return { path: deps.branchPath, source: 'branch' };
  }
  return { path: deps.materializeMaster(), source: 'master' };
}

/**
 * Materialise `master:e2e/docker/docker-compose.e2e.yml` into a temp file.
 *
 * `repoRoot` is passed so `git show` runs against the right working tree.
 */
export function materializeMasterCompose(repoRoot: string): string {
  const contents = execFileSync('git', ['show', `master:${COMPOSE_REPO_PATH}`], {
    cwd: repoRoot,
    encoding: 'utf-8',
    maxBuffer: 10 * 1024 * 1024,
  });
  const dir = mkdtempSync(join(tmpdir(), 'stack-runner-master-'));
  const out = join(dir, 'docker-compose.e2e.yml');
  writeFileSync(out, contents, 'utf-8');
  return out;
}

/**
 * Default wiring: probe the branch copy at `<repoRoot>/e2e/docker/...`, falling
 * back to the master copy from git.
 */
export function resolveComposeFileForRepo(repoRoot: string): ComposeResolution {
  const branchPath = join(repoRoot, COMPOSE_REPO_PATH);
  return resolveComposeFile({
    branchPath,
    exists: existsSync,
    materializeMaster: () => materializeMasterCompose(repoRoot),
  });
}

/**
 * The directory the branch compose file's relative build paths resolve against
 * (i.e. `<repoRoot>/e2e/docker`). Used to absolutise build contexts when the
 * derived compose file is written elsewhere.
 */
export function composeBaseDir(repoRoot: string): string {
  return dirname(join(repoRoot, COMPOSE_REPO_PATH));
}
