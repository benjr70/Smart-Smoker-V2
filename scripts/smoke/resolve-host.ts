/**
 * Tailscale peer-name resolver.
 *
 * Resolves a short hostname or FQDN to a full Tailscale FQDN
 * (e.g. `smoker-dev-cloud-1.tail74646.ts.net`).
 *
 * Injectable SshRunner for testability — production uses execFile('ssh', ...).
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Function that SSHes into `host` and returns stdout of `command`. */
export type SshRunner = (host: string, command: string) => Promise<string>;

/** Production SSH runner — connects as root@host. */
export const defaultSshRunner: SshRunner = async (
  host: string,
  command: string,
): Promise<string> => {
  const { stdout } = await execFileAsync('ssh', [`root@${host}`, command]);
  return stdout;
};

interface TailscaleNode {
  HostName: string;
  DNSName: string;
}

interface TailscaleStatus {
  Self: TailscaleNode;
  Peer: Record<string, TailscaleNode>;
}

/**
 * Strip trailing dot from a DNS name.
 * Tailscale always emits `hostname.tailnet.ts.net.` — strip the dot.
 */
function stripTrailingDot(name: string): string {
  return name.endsWith('.') ? name.slice(0, -1) : name;
}

/**
 * Resolve a short hostname or FQDN to its full Tailscale FQDN.
 *
 * Cases:
 *  (a) `input` already ends in `.ts.net` (±trailing dot) → strip dot, return.
 *  (b) `input` matches `Self.HostName` or a `Peer[*].HostName` → return their DNSName.
 *  (c) No match → throw with actionable message.
 *  (d) Multiple numbered peers share the same base → warn and return highest.
 */
export async function resolvePeerHostname(
  input: string,
  sshRunner: SshRunner,
): Promise<string> {
  // (a) Already a FQDN
  const normalised = stripTrailingDot(input);
  if (normalised.includes('.ts.net')) {
    return normalised;
  }

  // Need to SSH in and ask Tailscale
  const raw = await sshRunner(input, 'tailscale status --json');
  let status: TailscaleStatus;
  try {
    status = JSON.parse(raw) as TailscaleStatus;
  } catch {
    throw new Error(
      `resolve-host: failed to parse tailscale status JSON from ${input}: ${raw.slice(0, 200)}`,
    );
  }

  if (!status.Self || !status.Self.HostName || !status.Self.DNSName) {
    throw new Error(
      `resolve-host: tailscale status response from ${input} is missing Self.HostName / Self.DNSName`,
    );
  }

  // (b) Check Self first
  if (status.Self.HostName === input) {
    return stripTrailingDot(status.Self.DNSName);
  }

  // Gather all peers
  const peers = Object.values(status.Peer ?? {});

  // Exact match in peers
  const exactMatch = peers.find(p => p.HostName === input);
  if (exactMatch) {
    return stripTrailingDot(exactMatch.DNSName);
  }

  // (d) Multi-suffix: find peers whose HostName matches `<input>-<number>`
  const suffixRe = new RegExp(`^${escapeRegex(input)}-(\\d+)$`);
  const numberedMatches = peers
    .filter(p => suffixRe.test(p.HostName))
    .map(p => {
      const m = suffixRe.exec(p.HostName)!;
      return { peer: p, suffix: parseInt(m[1], 10) };
    });

  if (numberedMatches.length > 1) {
    numberedMatches.sort((a, b) => b.suffix - a.suffix);
    const winner = numberedMatches[0];
    const allNames = numberedMatches.map(m => m.peer.HostName).join(', ');
    console.warn(
      `resolve-host: WARNING — multiple peers match "${input}": [${allNames}]. ` +
        `Using highest suffix: ${winner.peer.HostName}`,
    );
    return stripTrailingDot(winner.peer.DNSName);
  }

  if (numberedMatches.length === 1) {
    return stripTrailingDot(numberedMatches[0].peer.DNSName);
  }

  // (c) No match
  const knownHosts = [status.Self.HostName, ...peers.map(p => p.HostName)].join(
    ', ',
  );
  throw new Error(
    `resolve-host: no Tailscale peer found matching "${input}". ` +
      `Known hosts: ${knownHosts}. ` +
      `Run \`tailscale status\` on the machine to verify peer names.`,
  );
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
