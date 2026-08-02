/**
 * CLI argument parsing for the pr-images uploader (pure — no fs, no browser).
 *
 *   tsx cli.ts login   [--profile <dir>]
 *   tsx cli.ts status  [--profile <dir>]
 *   tsx cli.ts upload  --pr <n> [--repo <owner/name>] [--profile <dir>]
 *                      [--timeout <ms>] [--headful] <file.png> [...]
 *
 * The uploader is the one place in the harness that needs a *logged-in* GitHub
 * session (GitHub has no public API for comment attachments — the web UI's
 * upload endpoint is cookie-authenticated), so the profile directory is a
 * first-class argument rather than a hidden constant.
 */

export type Command = 'login' | 'status' | 'upload';

export interface ParsedArgs {
  command: Command;
  /** PR number — required for `upload`. */
  prNumber?: number;
  /** `owner/name`; defaults to this repo. */
  repo: string;
  /** Persistent Chrome user-data-dir holding the GitHub session. */
  profileDir?: string;
  /** Per-upload wait budget in ms. */
  timeoutMs: number;
  /** Force a visible browser (login is always headful). */
  headful: boolean;
  /** PNG paths to upload, in the order they should appear in the PR body. */
  files: string[];
}

export const DEFAULT_REPO = 'benjr70/Smart-Smoker-V2';
export const DEFAULT_TIMEOUT_MS = 120_000;

const COMMANDS: readonly string[] = ['login', 'status', 'upload'];

/** Splits `--flag=value` into `['--flag', 'value']`; leaves other tokens alone. */
function splitEquals(argv: string[]): string[] {
  const out: string[] = [];
  for (const token of argv) {
    if (token.startsWith('--') && token.includes('=')) {
      const idx = token.indexOf('=');
      out.push(token.slice(0, idx), token.slice(idx + 1));
    } else {
      out.push(token);
    }
  }
  return out;
}

function requireValue(value: string | undefined, flag: string): string {
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`${flag} expects a value`);
  }
  return value;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const tokens = splitEquals(argv);
  const command = tokens[0];

  if (!command || !COMMANDS.includes(command)) {
    throw new Error(`unknown command '${command ?? ''}' — expected one of ${COMMANDS.join(', ')}`);
  }

  const parsed: ParsedArgs = {
    command: command as Command,
    repo: DEFAULT_REPO,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    headful: false,
    files: [],
  };

  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];
    switch (token) {
      case '--pr': {
        const value = Number(tokens[++i]);
        if (!Number.isInteger(value) || value <= 0) {
          throw new Error(`--pr expects a positive integer, got '${tokens[i]}'`);
        }
        parsed.prNumber = value;
        break;
      }
      case '--repo':
        parsed.repo = requireValue(tokens[++i], '--repo');
        break;
      case '--profile':
        parsed.profileDir = requireValue(tokens[++i], '--profile');
        break;
      case '--timeout': {
        const value = Number(tokens[++i]);
        if (!Number.isFinite(value) || value <= 0) {
          throw new Error(`--timeout expects a positive number of ms`);
        }
        parsed.timeoutMs = value;
        break;
      }
      case '--headful':
        parsed.headful = true;
        break;
      default:
        if (token.startsWith('--')) {
          throw new Error(`unknown flag '${token}'`);
        }
        parsed.files.push(token);
    }
  }

  if (parsed.command === 'upload') {
    if (parsed.prNumber === undefined) {
      throw new Error('upload requires --pr <number>');
    }
    if (parsed.files.length === 0) {
      throw new Error('upload requires at least one image file');
    }
  }

  if (!/^[^/\s]+\/[^/\s]+$/.test(parsed.repo)) {
    throw new Error(`--repo expects owner/name, got '${parsed.repo}'`);
  }

  return parsed;
}
