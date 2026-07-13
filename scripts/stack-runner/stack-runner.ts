/**
 * up / down orchestration for a hermetic per-PR stack.
 *
 * `up` reads the shared e2e compose file, derives a per-PR-isolated document,
 * writes it to a temp file, and drives `docker compose ... up --build -d` under
 * a per-PR project name; it then blocks on health and, on any failure, tears the
 * stack down so no orphan containers or volumes survive (AC 4). `down` removes
 * the project's containers and volumes and is idempotent (AC 5).
 *
 * All side effects (spawning docker, health polling, file writes) are injected
 * so the control flow is unit-tested without docker (behaviors 4 & 5). The
 * default wiring in cli.ts supplies the real implementations.
 */
import { execFile } from 'node:child_process';
import type { StackConfig } from './stack-config.ts';
import { deriveComposeDocument, type ComposeDocument } from './derive-compose.ts';

/** Result of running a subprocess. */
export interface CommandResult {
  stdout: string;
  stderr: string;
  code: number;
}

export interface RunOptions {
  cwd?: string;
  log?: (msg: string) => void;
}

/** Runs a subprocess and resolves with its captured output + exit code. */
export type CommandRunner = (
  cmd: string,
  args: string[],
  options?: RunOptions
) => Promise<CommandResult>;

/** Production runner: spawn via execFile, never reject on nonzero exit. */
export const defaultCommandRunner: CommandRunner = (cmd, args, options = {}) =>
  new Promise<CommandResult>(resolvePromise => {
    const child = execFile(
      cmd,
      args,
      { cwd: options.cwd, maxBuffer: 64 * 1024 * 1024 },
      (error, stdout, stderr) => {
        const code =
          error && typeof (error as { code?: unknown }).code === 'number'
            ? ((error as { code: number }).code as number)
            : error
              ? 1
              : 0;
        resolvePromise({ stdout: stdout.toString(), stderr: stderr.toString(), code });
      }
    );
    child.on('error', err => {
      resolvePromise({ stdout: '', stderr: String(err), code: 127 });
    });
  });

/**
 * Tear down a project's containers and volumes. Idempotent: `docker compose -p
 * <project> down -v` exits 0 even when the project has nothing to remove.
 * Throws only on a genuine teardown failure (nonzero exit).
 */
export async function down(
  projectName: string,
  runner: CommandRunner = defaultCommandRunner
): Promise<CommandResult> {
  if (!projectName) {
    throw new Error('stack-runner: down requires a non-empty project name');
  }
  const result = await runner('docker', [
    'compose',
    '-p',
    projectName,
    'down',
    '-v',
    '--remove-orphans',
  ]);
  if (result.code !== 0) {
    throw new Error(
      `stack-runner: teardown of project "${projectName}" failed (exit ${result.code}): ${result.stderr.trim()}`
    );
  }
  return result;
}

/** Everything `up` needs, injected so the flow is testable without docker. */
export interface UpDeps {
  config: StackConfig;
  /** Absolute path to the resolved base compose file. */
  composePath: string;
  /** Directory the base file's relative build context resolves against. */
  baseDir: string;
  /** Reads + parses the base compose file. */
  loadCompose: (path: string) => ComposeDocument;
  /** Writes the derived document to a temp file, returns its path. */
  writeDerived: (doc: ComposeDocument, projectName: string) => string;
  /** Spawns subprocesses. */
  runner: CommandRunner;
  /** Blocks until every service answers, or throws after a bounded wait. */
  waitForHealthy: (config: StackConfig) => Promise<void>;
  log?: (msg: string) => void;
}

/**
 * Boot the stack from the current checkout under a per-PR project name and block
 * until healthy. Cleans up (down -v) on any failure so a failed boot leaves no
 * orphan containers or volumes behind, then rethrows.
 */
export async function up(deps: UpDeps): Promise<StackConfig> {
  const { config, runner } = deps;
  const log = deps.log ?? (() => undefined);
  const projectName = config.projectName;

  const base = deps.loadCompose(deps.composePath);
  const derived = deriveComposeDocument(base, config, deps.baseDir);
  const derivedPath = deps.writeDerived(derived, projectName);

  try {
    log(`[stack-runner] building + starting ${projectName} from ${deps.composePath}`);
    const upResult = await runner('docker', [
      'compose',
      '-f',
      derivedPath,
      '-p',
      projectName,
      'up',
      '--build',
      '-d',
    ]);
    if (upResult.code !== 0) {
      throw new Error(
        `stack-runner: \`docker compose up\` failed (exit ${upResult.code}): ${upResult.stderr.trim()}`
      );
    }

    log(`[stack-runner] waiting for ${projectName} services to become healthy`);
    await deps.waitForHealthy(config);
  } catch (err) {
    log(`[stack-runner] boot failed, cleaning up ${projectName}: ${(err as Error).message}`);
    await cleanup(projectName, runner, log);
    throw err;
  }

  return config;
}

/** Best-effort teardown used on the failure path; never masks the original error. */
async function cleanup(
  projectName: string,
  runner: CommandRunner,
  log: (msg: string) => void
): Promise<void> {
  try {
    await down(projectName, runner);
  } catch (cleanupErr) {
    log(`[stack-runner] cleanup of ${projectName} also failed: ${(cleanupErr as Error).message}`);
  }
}
