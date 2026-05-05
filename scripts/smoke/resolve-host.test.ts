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
const fixtureJson = readFileSync(
  join(__dirname, 'fixtures', 'tailscale-status.json'),
  'utf-8',
);

/** Stub SshRunner that always returns the fixture JSON */
const stubSshRunner: SshRunner = async (_host: string, _cmd: string) =>
  fixtureJson;

/** Stub that returns fixture JSON containing only one peer with "smoker-dev-cloud-1" */
const singlePeerFixture = JSON.stringify({
  Self: {
    HostName: 'my-local-machine',
    DNSName: 'my-local-machine.tail74646.ts.net.',
  },
  Peer: {
    abc123: {
      HostName: 'smoker-dev-cloud-1',
      DNSName: 'smoker-dev-cloud-1.tail74646.ts.net.',
    },
  },
});

const singlePeerRunner: SshRunner = async () => singlePeerFixture;

describe('resolvePeerHostname', () => {
  describe('case (a): exact FQDN passthrough', () => {
    it('returns the FQDN as-is when input ends with .ts.net', async () => {
      const result = await resolvePeerHostname(
        'smoker-dev-cloud-1.tail74646.ts.net',
        stubSshRunner,
      );
      assert.equal(result, 'smoker-dev-cloud-1.tail74646.ts.net');
    });

    it('strips trailing dot when input is a raw DNS FQDN with trailing dot', async () => {
      const result = await resolvePeerHostname(
        'smoker-dev-cloud-1.tail74646.ts.net.',
        stubSshRunner,
      );
      assert.equal(result, 'smoker-dev-cloud-1.tail74646.ts.net');
    });
  });

  describe('case (b): short name to FQDN expansion', () => {
    it('resolves a short hostname to its full FQDN via peer lookup', async () => {
      const result = await resolvePeerHostname(
        'smoker-dev-cloud-1',
        singlePeerRunner,
      );
      assert.equal(result, 'smoker-dev-cloud-1.tail74646.ts.net');
    });

    it('resolves Self.HostName if it matches the input', async () => {
      const selfFixture = JSON.stringify({
        Self: {
          HostName: 'smoker-dev-cloud-1',
          DNSName: 'smoker-dev-cloud-1.tail74646.ts.net.',
        },
        Peer: {},
      });
      const runner: SshRunner = async () => selfFixture;
      const result = await resolvePeerHostname('smoker-dev-cloud-1', runner);
      assert.equal(result, 'smoker-dev-cloud-1.tail74646.ts.net');
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
            `Expected error message to include hostname, got: ${err.message}`,
          );
          return true;
        },
      );
    });
  });

  describe('case (d): multi-suffix → highest with warning', () => {
    it('returns the peer with the highest numeric suffix when multiple match', async () => {
      // fixture has smoker-dev-cloud-1 and smoker-dev-cloud-2
      // The base name "smoker-dev-cloud" matches both; should pick -2 (highest)
      const multiFixture = JSON.stringify({
        Self: {
          HostName: 'my-local-machine',
          DNSName: 'my-local-machine.tail74646.ts.net.',
        },
        Peer: {
          abc123: {
            HostName: 'smoker-dev-cloud-1',
            DNSName: 'smoker-dev-cloud-1.tail74646.ts.net.',
          },
          def456: {
            HostName: 'smoker-dev-cloud-2',
            DNSName: 'smoker-dev-cloud-2.tail74646.ts.net.',
          },
        },
      });
      const runner: SshRunner = async () => multiFixture;

      // Capture console.warn output
      const warnMessages: string[] = [];
      const originalWarn = console.warn;
      console.warn = (...args: unknown[]) => {
        warnMessages.push(args.map(String).join(' '));
      };

      let result: string;
      try {
        result = await resolvePeerHostname('smoker-dev-cloud', runner);
      } finally {
        console.warn = originalWarn;
      }

      assert.equal(result!, 'smoker-dev-cloud-2.tail74646.ts.net');
      assert.ok(
        warnMessages.length > 0,
        'Expected at least one console.warn to be emitted',
      );
    });
  });
});
