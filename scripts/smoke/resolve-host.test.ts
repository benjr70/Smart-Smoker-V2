/**
 * Unit tests for resolvePeerHostname
 * Uses node:test (zero-dep) + assert/strict
 * Fixture: fixtures/tailscale-status.json
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { resolvePeerHostname, type SshRunner } from './resolve-host.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load fixture once
const fixtureJson = readFileSync(join(__dirname, 'fixtures', 'tailscale-status.json'), 'utf-8');

/** Stub SshRunner that always returns the fixture JSON */
const stubSshRunner: SshRunner = async (_host: string, _cmd: string) => fixtureJson;

// Canonical dev-cloud hostname (issue #189). The legacy un-prefixed form (and
// its numeric `-1` variant) is forbidden by the hostname guard; the canonical
// name carries the `smart-` prefix and no numeric suffix.
const DEV_CLOUD_BASE = 'smart-smoker-dev-cloud';

/** Stub that returns fixture JSON containing only one dev-cloud peer */
const singlePeerFixture = JSON.stringify({
  Self: {
    HostName: 'my-local-machine',
    DNSName: 'my-local-machine.tail74646.ts.net.',
  },
  Peer: {
    abc123: {
      HostName: DEV_CLOUD_BASE,
      DNSName: `${DEV_CLOUD_BASE}.tail74646.ts.net.`,
    },
  },
});

const singlePeerRunner: SshRunner = async () => singlePeerFixture;

describe('resolvePeerHostname', () => {
  describe('case (a): exact FQDN passthrough', () => {
    it('returns the FQDN as-is when input ends with .ts.net', async () => {
      const result = await resolvePeerHostname(
        `${DEV_CLOUD_BASE}.tail74646.ts.net`,
        stubSshRunner
      );
      assert.equal(result, `${DEV_CLOUD_BASE}.tail74646.ts.net`);
    });

    it('strips trailing dot when input is a raw DNS FQDN with trailing dot', async () => {
      const result = await resolvePeerHostname(
        `${DEV_CLOUD_BASE}.tail74646.ts.net.`,
        stubSshRunner
      );
      assert.equal(result, `${DEV_CLOUD_BASE}.tail74646.ts.net`);
    });
  });

  describe('case (b): short name to FQDN expansion', () => {
    it('resolves a short hostname to its full FQDN via peer lookup', async () => {
      const result = await resolvePeerHostname(DEV_CLOUD_BASE, singlePeerRunner);
      assert.equal(result, `${DEV_CLOUD_BASE}.tail74646.ts.net`);
    });

    it('resolves Self.HostName if it matches the input', async () => {
      const selfFixture = JSON.stringify({
        Self: {
          HostName: DEV_CLOUD_BASE,
          DNSName: `${DEV_CLOUD_BASE}.tail74646.ts.net.`,
        },
        Peer: {},
      });
      const runner: SshRunner = async () => selfFixture;
      const result = await resolvePeerHostname(DEV_CLOUD_BASE, runner);
      assert.equal(result, `${DEV_CLOUD_BASE}.tail74646.ts.net`);
    });
  });

  describe('case (c): no-match throws', () => {
    it('throws with an actionable message when no peer matches', async () => {
      await assert.rejects(
        () => resolvePeerHostname('nonexistent-host', stubSshRunner),
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.ok(
            err.message.includes('nonexistent-host'),
            `Expected error message to include hostname, got: ${err.message}`
          );
          return true;
        }
      );
    });
  });

  describe('case (d): multi-suffix → highest with warning', () => {
    it('returns the peer with the highest numeric suffix when multiple match', async () => {
      // Inline fixture covering two peers that share DEV_CLOUD_BASE.
      // The base matches both `-1` and `-2`; resolver should pick `-2`.
      const multiFixture = JSON.stringify({
        Self: {
          HostName: 'my-local-machine',
          DNSName: 'my-local-machine.tail74646.ts.net.',
        },
        Peer: {
          abc123: {
            HostName: `${DEV_CLOUD_BASE}-1`,
            DNSName: `${DEV_CLOUD_BASE}-1.tail74646.ts.net.`,
          },
          def456: {
            HostName: `${DEV_CLOUD_BASE}-2`,
            DNSName: `${DEV_CLOUD_BASE}-2.tail74646.ts.net.`,
          },
        },
      });
      const runner: SshRunner = async () => multiFixture;

      const warnMessages: string[] = [];
      const originalWarn = console.warn;
      console.warn = (...args: unknown[]) => {
        warnMessages.push(args.map(String).join(' '));
      };

      let result: string;
      try {
        result = await resolvePeerHostname(DEV_CLOUD_BASE, runner);
      } finally {
        console.warn = originalWarn;
      }

      assert.equal(result!, `${DEV_CLOUD_BASE}-2.tail74646.ts.net`);
      assert.ok(warnMessages.length > 0, 'Expected at least one console.warn to be emitted');
    });
  });
});
