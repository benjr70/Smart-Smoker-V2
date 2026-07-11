/**
 * Pure CLI argument parsing for the stack-runner.
 *
 * Grammar:
 *   up   --pr <n> | --project <name>
 *   down --pr <n> | --project <name>
 *
 * `--pr` and `--project` accept both space (`--pr 328`) and equals
 * (`--pr=328`) forms. `up` needs a PR number (or explicit project name); `down`
 * needs either. Kept side-effect-free so it is unit-tested in isolation.
 */
export type StackCommand = 'up' | 'down';

export interface ParsedArgs {
  command: StackCommand;
  prNumber?: number;
  projectName?: string;
}

const COMMANDS: readonly StackCommand[] = ['up', 'down'];

function readFlag(argv: string[], name: string, index: number): { value: string; next: number } {
  const token = argv[index];
  const eq = `--${name}=`;
  if (token.startsWith(eq)) {
    return { value: token.slice(eq.length), next: index + 1 };
  }
  const value = argv[index + 1];
  if (value === undefined) {
    throw new Error(`stack-runner: flag --${name} requires a value`);
  }
  return { value, next: index + 2 };
}

export function parseArgs(argv: string[]): ParsedArgs {
  const command = argv[0] as StackCommand;
  if (!command || !COMMANDS.includes(command)) {
    throw new Error(
      `stack-runner: expected a subcommand (${COMMANDS.join(' | ')}), got: ${command ?? '<none>'}`
    );
  }

  let prNumber: number | undefined;
  let projectName: string | undefined;

  let i = 1;
  while (i < argv.length) {
    const token = argv[i];
    if (token === '--pr' || token.startsWith('--pr=')) {
      const { value, next } = readFlag(argv, 'pr', i);
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error(`stack-runner: --pr must be a positive integer, got: ${value}`);
      }
      prNumber = parsed;
      i = next;
    } else if (token === '--project' || token.startsWith('--project=')) {
      const { value, next } = readFlag(argv, 'project', i);
      projectName = value;
      i = next;
    } else {
      throw new Error(`stack-runner: unknown argument: ${token}`);
    }
  }

  if (prNumber === undefined && projectName === undefined) {
    throw new Error(`stack-runner: ${command} requires --pr <n> or --project <name>`);
  }

  return { command, prNumber, projectName };
}
