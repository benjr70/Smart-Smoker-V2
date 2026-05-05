#!/usr/bin/env node
/**
 * Thin CLI wrapper around resolvePeerHostname.
 * Usage: node --import tsx/esm scripts/smoke/resolve-host-cli.ts <host>
 * Prints the resolved FQDN to stdout and exits 0, or prints an error to stderr and exits 1.
 */
import { resolvePeerHostname, defaultSshRunner } from './resolve-host.js';

const input = process.argv[2];

if (!input) {
  process.stderr.write('Usage: resolve-host-cli.ts <hostname-or-fqdn>\n');
  process.exit(1);
}

resolvePeerHostname(input, defaultSshRunner)
  .then(fqdn => {
    process.stdout.write(fqdn + '\n');
    process.exit(0);
  })
  .catch((err: unknown) => {
    process.stderr.write(`resolve-host: ${(err as Error).message}\n`);
    process.exit(1);
  });
