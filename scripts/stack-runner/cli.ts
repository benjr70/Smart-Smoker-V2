#!/usr/bin/env node
/**
 * stack-runner CLI — one command to boot the full app hermetically from a PR
 * checkout, one to tear it down.
 *
 *   tsx cli.ts up   --pr <n>
 *   tsx cli.ts down --pr <n> | --project <name>
 *
 * `up` prints the service URLs + hermetic mongo connection string on stdout in
 * the stable `KEY=value` contract (see stack-config.formatStackOutput); progress
 * logs go to stderr so stdout stays machine-parseable.
 *
 * This is the thin production wiring: pure logic lives in the sibling modules
 * (all unit-tested); here we bind the real docker/fs/git side effects.
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, stringify } from 'yaml';
import { parseArgs } from './cli-args.ts';
import { computeStackConfig, formatStackOutput } from './stack-config.ts';
import { resolveComposeFileForRepo, composeBaseDir } from './compose-file.ts';
import type { ComposeDocument } from './derive-compose.ts';
import { up, down, defaultCommandRunner } from './stack-runner.ts';
import { healthTargets, waitForHealthy } from './health-wait.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
/** Repo root is two levels above scripts/stack-runner. */
const REPO_ROOT = resolve(__dirname, '..', '..');

const logStderr = (msg: string): void => {
  process.stderr.write(msg + '\n');
};

function loadCompose(path: string): ComposeDocument {
  return parse(readFileSync(path, 'utf-8')) as ComposeDocument;
}

function writeDerived(doc: ComposeDocument, projectName: string): string {
  const dir = mkdtempSync(join(tmpdir(), `stack-runner-${projectName}-`));
  const out = join(dir, `docker-compose.${projectName}.yml`);
  writeFileSync(out, stringify(doc), 'utf-8');
  return out;
}

async function runUp(prNumber: number | undefined): Promise<void> {
  if (prNumber === undefined) {
    throw new Error('stack-runner: up requires --pr <n> to allocate an isolated port block');
  }
  const config = computeStackConfig(prNumber);
  const resolution = resolveComposeFileForRepo(REPO_ROOT);
  logStderr(`[stack-runner] using ${resolution.source} compose file: ${resolution.path}`);

  await up({
    config,
    composePath: resolution.path,
    baseDir: composeBaseDir(REPO_ROOT),
    loadCompose,
    writeDerived,
    runner: defaultCommandRunner,
    waitForHealthy: cfg => waitForHealthy(healthTargets(cfg), { log: logStderr }),
    log: logStderr,
  });

  process.stdout.write(formatStackOutput(config));
}

async function runDown(
  prNumber: number | undefined,
  projectName: string | undefined
): Promise<void> {
  const project = projectName ?? computeStackConfig(prNumber as number).projectName;
  await down(project, defaultCommandRunner);
  logStderr(`[stack-runner] tore down ${project}`);
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.command === 'up') {
    await runUp(parsed.prNumber);
  } else {
    await runDown(parsed.prNumber, parsed.projectName);
  }
}

main().catch((err: unknown) => {
  const message = (err as Error).message ?? String(err);
  process.stderr.write(
    (message.startsWith('stack-runner:') ? message : `stack-runner: ${message}`) + '\n'
  );
  process.exit(1);
});
