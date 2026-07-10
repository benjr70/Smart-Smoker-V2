# Claude Agent VM — Setup Guide

A dedicated Ubuntu Desktop VM on Proxmox that gives Claude Code its own
full development environment: clone the repo, write code, run tests, run
the apps with a real GUI/Electron window, push branches, open PRs.
Replaces the prior remote-routine model so every step happens locally on
hardware Claude controls.

This guide sets up the environment only. Scheduling/triggering of
autonomous fires is handled by the budget-paced `agent-daemon` systemd
service — see [Autonomous Loop](../Teams/autonomous-loop.md) for the
daemon, `/team-pickup`, PR CI babysitting (`/pr-watch`), manual
verification, and the PR reconcile flow (`/pr-reconcile`).

---

## 1. Decisions locked (reference)

| # | Topic | Choice |
|---|-------|--------|
| 1  | Claude binary | Both Claude Code CLI **and** Claude Agent SDK |
| 2  | Run mode | Headless one-shot **and** long-lived tmux |
| 3  | Permission mode (autonomous) | `bypassPermissions` |
| 4  | Working dir | Persistent clone at `~/Smart-Smoker-V2`, branch-per-fire |
| 5  | Anthropic auth | Pro/Max OAuth via `claude /login` |
| 6  | GitHub auth | Classic PAT, scopes `repo, project, workflow` |
| 7  | Git author identity | Bot — `claude-agent <claude-agent@benjr70.local>` |
| 8  | Node | `24.7.0` exact via `nvm` (matches CI) |
| 9  | Docker | Engine + Buildx + Compose v2, `claude` user in `docker` group |
| 10 | Mongo | New `dev.docker-compose.yml` with Mongo only — local-dev DB |
| 11 | Browsers | Playwright Chromium + system Google Chrome |
| 12 | Electron | Real window via host GUI (libraries pre-installed) |
| 13 | Remote access | Tailscale SSH + Proxmox web console only |
| 14 | Skills scope | Project skills **plus** mirror user-level `~/.claude/skills/` |
| 15 | MCP servers | Project `.mcp.json` MCPs + add `github` MCP |
| 16 | Dotfiles | Manual `scp` from dev box |
| 17 | Git push transport | HTTPS via gh-managed PAT credential helper |
| 18 | Linux user | `claude` (single user) |
| 19 | Sudo | None for `claude` (admin sudo manually when needed) |
| 20 | Repo clone | Full `gh repo clone`, all branches, full history |
| 21 | App `.env` | Fresh dev values pointing at local Mongo |
| 22 | Firewall | `ufw`: deny LAN inbound, allow `tailscale0` |
| 23 | Hostname | `claude-agent-1` |
| 24 | Tailscale auth | Interactive `tailscale up` (browser flow) |
| 25 | Disk layout | Single ext4 root + 4 GB swapfile |
| 26 | Logs | Defer; just create `~/claude-agent/logs/` |
| 27 | Apt baseline | Full set (core + dev ergonomics + repo specifics) |

---

## 2. VM provisioning (Proxmox)

Create the VM through the Proxmox UI. Suggested params:

| Setting | Value |
|---------|-------|
| Name | `claude-agent-1` |
| OS ISO | Ubuntu Desktop 24.04 LTS (`ubuntu-24.04-desktop-amd64.iso`) |
| BIOS | OVMF (UEFI) |
| Machine type | `q35` |
| CPU | `host`, 6 cores |
| Memory | 12288 MB (12 GB) |
| Disk | 50 GB, format `qcow2` (or `raw` on ZFS), discard on |
| Network NIC 1 | LAN bridge (`vmbr0`), virtio |
| Network NIC 2 | (optional) — second NIC not needed; Tailscale runs over the LAN NIC |
| Boot order | DVD → Disk |

The "two interfaces" plan (Q5) is logical, not physical: one NIC carries
LAN traffic, Tailscale creates the `tailscale0` virtual interface on top.

Install Ubuntu Desktop normally:

- Hostname: `claude-agent-1`
- Username: `claude`
- Strong password (no passwordless sudo — see §10)
- Auto-login: off
- Disk: erase entire disk, single ext4 root, swapfile (default Ubuntu
  installer behavior matches Q25)

Reboot, log in as `claude`, run `sudo apt update && sudo apt full-upgrade -y`,
reboot once more.

---

## 3. Apt baseline

```bash
sudo apt update
sudo apt install -y \
  git curl wget jq build-essential ca-certificates xclip \
  tmux htop ripgrep fd-find bat tree neovim \
  python3-pip pkg-config libssl-dev mesa-utils \
  ufw apt-transport-https gnupg lsb-release software-properties-common
```

`fd-find` ships the binary as `fdfind` on Ubuntu — alias if desired:

```bash
mkdir -p ~/.local/bin
ln -s "$(which fdfind)" ~/.local/bin/fd
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
```

Electron runtime libraries (most ship with Desktop edition; install
explicitly to be sure):

```bash
sudo apt install -y \
  libgtk-3-0 libnss3 libasound2t64 libxss1 libxtst6 libgbm1 \
  libnotify4 libxshmfence1
```

---

## 4. Networking

### 4a. Tailscale

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up --hostname=claude-agent-1
```

A browser link appears — open it on a logged-in machine, approve the
node. Verify:

```bash
tailscale status | head -3
tailscale ip -4
```

The node should appear in the tailnet as
`claude-agent-1.tail74646.ts.net`.

### 4b. UFW — LAN deny, Tailscale allow

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow in on tailscale0
sudo ufw enable
sudo ufw status verbose
```

SSH is reachable only over Tailscale. App ports (3000/3001/3003/8080)
listen on all interfaces but the firewall blocks LAN inbound, so only
tailnet peers can connect.

### 4c. Tailscale SSH (optional but recommended)

```bash
sudo tailscale up --hostname=claude-agent-1 --ssh
```

Lets you `ssh claude@claude-agent-1` from any other tailnet device with
no key management.

---

## 5. Linux user `claude`

Already created during install. Verify and harden:

```bash
# Confirm user `claude` is NOT in the sudo group (Q19).
groups claude
# expect: claude (no sudo / adm)

# If sudo was added during install, remove it:
sudo deluser claude sudo
```

Admin operations are performed by logging into the Proxmox console as
root or any other admin account — `claude` stays unprivileged.

---

## 6. Node.js via nvm

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install 24.7.0
nvm alias default 24.7.0
node -v   # → v24.7.0
npm -v
```

Global tools that the workflow needs:

```bash
npm install -g @anthropic-ai/claude-code @anthropic-ai/sdk
```

`claude-code` is the CLI. The SDK is installed because Q1 = both — even
if you never use it from a script, having it in the global path makes
ad-hoc Node experiments work.

---

## 7. Docker

Install Docker Engine + Buildx + Compose v2 from Docker's apt repo:

```bash
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo tee /etc/apt/keyrings/docker.asc >/dev/null
sudo chmod a+r /etc/apt/keyrings/docker.asc

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

sudo usermod -aG docker claude
# log out / back in for group change to apply
```

Verify (after re-login):

```bash
docker --version
docker compose version
docker buildx version
docker run --rm hello-world
```

---

## 8. Browsers

System Chrome (for human visual testing and any Claude-driven manual
checks):

```bash
wget -O /tmp/chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
sudo apt install -y /tmp/chrome.deb
rm /tmp/chrome.deb
google-chrome --version
```

Playwright Chromium gets installed per-repo after cloning the repo
(§11).

---

## 9. GitHub CLI + auth

```bash
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
  | sudo dd of=/etc/apt/keyrings/githubcli-archive-keyring.gpg
sudo chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] \
  https://cli.github.com/packages stable main" \
  | sudo tee /etc/apt/sources.list.d/github-cli.list >/dev/null
sudo apt update
sudo apt install -y gh
```

Generate a **classic** PAT at <https://github.com/settings/tokens>:

- Note: `claude-agent-vm`
- Expiration: 90 days (rotate on calendar)
- Scopes: `repo`, `project`, `workflow`

Save the token to `~/.config/claude-agent/gh-pat` (mode 600), then:

```bash
mkdir -p ~/.config/claude-agent
chmod 700 ~/.config/claude-agent
# paste token into the file via the editor of your choice
chmod 600 ~/.config/claude-agent/gh-pat

gh auth login --with-token < ~/.config/claude-agent/gh-pat
gh auth setup-git    # configures HTTPS credential helper for `git push`
gh auth status
```

Verify the `project` scope is present in the output. Without it,
`team-pickup` falls back to the GitHub MCP path — also fine.

---

## 10. Git config (bot identity)

```bash
git config --global user.name  "claude-agent"
git config --global user.email "claude-agent@benjr70.local"
git config --global init.defaultBranch master
git config --global pull.rebase false
git config --global push.default current
```

The `claude-agent@benjr70.local` address is intentionally
non-deliverable — commits clearly attribute to the bot but never spam a
real inbox. Adjust the domain if you prefer a real email you control.

---

## 11. Clone the repo

```bash
cd ~
gh repo clone benjr70/Smart-Smoker-V2
cd Smart-Smoker-V2
git status
```

Bootstrap the workspace (the repo's `npm install` requires
`--legacy-peer-deps`, wrapped by `npm run bootstrap`):

```bash
npm run bootstrap
```

Install Playwright Chromium and its system dependencies:

```bash
npx playwright install --with-deps chromium
```

---

## 12. Local Mongo via docker compose

The repo's existing `cloud.docker-compose.yml` carries a full prod-like
stack. For dev/test on this VM we only need Mongo. Create
`dev.docker-compose.yml` at the repo root:

```yaml
# dev.docker-compose.yml — local Mongo for the claude-agent VM
services:
  mongo:
    image: mongo:7.0
    container_name: dev-mongo
    restart: unless-stopped
    ports:
      - 127.0.0.1:27017:27017
    volumes:
      - dev_mongo_data:/data/db

volumes:
  dev_mongo_data:
```

Start it:

```bash
docker compose -f dev.docker-compose.yml up -d
docker compose -f dev.docker-compose.yml ps
```

Mongo URI for app `.env` files: `mongodb://127.0.0.1:27017/smartsmoker`.

---

## 13. App `.env` files

Repo apps read environment variables at runtime. Author fresh dev values
on the VM — never copy production secrets to a bot host.

`apps/backend/.env`:

```bash
DB_URL=mongodb://127.0.0.1:27017/smartsmoker
PORT=3001
JWT_SECRET=dev-only-not-a-real-secret-rotate-me
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:dev@benjr70.local
```

Generate VAPID keys if web-push tests need them:

```bash
npx web-push generate-vapid-keys
```

`apps/device-service/.env`:

```bash
PORT=3003
BACKEND_URL=http://127.0.0.1:3001
```

`apps/frontend/.env`:

```bash
REACT_APP_BACKEND_URL=http://127.0.0.1:3001
```

`apps/smoker/.env` (Electron renderer, if applicable):

```bash
REACT_APP_BACKEND_URL=http://127.0.0.1:3001
```

The actual variable names each app expects should be confirmed against
the consuming code; the values above are placeholders that match the
ports table in `CLAUDE.md`.

---

## 14. Claude Code configuration

### 14a. Anthropic OAuth login

```bash
claude /login
```

A browser link is printed — log in with your Pro/Max account, grant
access. The credential lands at `~/.claude/.credentials.json` and
auto-refreshes.

### 14b. Mirror user-level skills from your dev box

From your **dev box**:

```bash
ssh claude@claude-agent-1 "mkdir -p ~/.claude/skills"
scp -r ~/.claude/skills/* claude@claude-agent-1:~/.claude/skills/
scp ~/.gitconfig          claude@claude-agent-1:~/.gitconfig.devbox  # for reference only
```

The repo's `.claude/skills/` and `.claude/settings.json` already travel
with the clone in §11 — no extra step needed for project skills.

### 14c. Add `github` MCP to the project

Edit `.mcp.json` at the repo root and add a `github` server. Example:

```jsonc
{
  "mcpServers": {
    "context7":   { "type": "stdio", "command": "npx", "args": ["-y", "@upstash/context7-mcp"], "env": {} },
    "playwright": { "type": "stdio", "command": "npx", "args": ["-y", "@playwright/mcp@latest"], "env": {} },
    "terraform":  { "type": "stdio", "command": "npx", "args": ["-y", "@hashicorp/terraform-mcp-server"], "env": {} },
    "docker":     { "type": "stdio", "command": "npx", "args": ["-y", "@quantgeekdev/docker-mcp"], "env": {} },
    "mongodb":    { "type": "stdio", "command": "npx", "args": ["-y", "mongodb-mcp-server"], "env": {} },
    "github": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}"
      }
    }
  }
}
```

Export `GITHUB_TOKEN` in `~/.bashrc` from the same PAT used for `gh`:

```bash
echo 'export GITHUB_TOKEN="$(cat ~/.config/claude-agent/gh-pat)"' >> ~/.bashrc
```

Commit the `.mcp.json` change in a normal PR — it benefits every clone,
not just this VM.

### 14d. Working directory layout

```
/home/claude/
  Smart-Smoker-V2/          ← persistent clone, branch per fire
  claude-agent/
    logs/                    ← future fire logs (rotation set up later)
  .claude/
    .credentials.json
    skills/                  ← mirrored user skills
  .config/claude-agent/
    gh-pat                   ← 600 PAT file
```

Create the log directory and a basic logrotate config:

```bash
mkdir -p ~/claude-agent/logs
sudo tee /etc/logrotate.d/claude-agent >/dev/null <<'EOF'
/home/claude/claude-agent/logs/*.log {
    weekly
    rotate 8
    compress
    missingok
    notifempty
    su claude claude
}
EOF
```

---

## 15. Smoke test — VM is ready

Run from `~/Smart-Smoker-V2`:

```bash
# 1. Toolchain
node -v                                  # v24.7.0
npm -v
docker compose version
gh auth status
claude --version

# 2. Workspace install
npm run bootstrap

# 3. Lint + format check
npm run lint
npm run format:check

# 4. Tests, per app (must run from each app dir per CLAUDE.md)
( cd apps/backend         && npm test )
( cd apps/device-service  && npm test )
( cd apps/frontend        && npm test )
( cd apps/smoker          && npm test )
( cd packages/TemperatureChart && npm test )

# 5. Mongo reachable
docker compose -f dev.docker-compose.yml ps
mongosh --quiet --eval 'db.runCommand({ping:1})' mongodb://127.0.0.1:27017 || \
  docker exec dev-mongo mongosh --quiet --eval 'db.runCommand({ping:1})'

# 6. Headed Electron (smoker) at least starts
npm run smoker:start &
SMOKER_PID=$!
sleep 8
ps -p $SMOKER_PID > /dev/null && echo "smoker UP" || echo "smoker FAILED"
kill $SMOKER_PID 2>/dev/null

# 7. Claude Code can clone its own context
claude --print --permission-mode bypassPermissions \
  "Read CLAUDE.md and reply with the four app names in this monorepo, comma-separated. No other text."
```

If all of the above succeed, the VM is ready.

---

## 16. What's *not* in this guide

- **Scheduling** — how/when autonomous fires are triggered. Deferred per
  user direction. Future doc will cover systemd timer vs cron vs
  remote-routine, log shipping, alerting.
- **PR-check watcher** — auto-fix-on-red flow. Same reason.
- **Backups / snapshots** — Proxmox-native concern; configure under your
  existing backup policy.
- **Multi-fire concurrency** — single VM, single fire at a time per
  `team:in-progress` distributed lock. Scaling out is a future-VM topic.

---

## 17. Operations cheatsheet

```bash
# SSH in (from any tailnet device)
ssh claude@claude-agent-1

# Manual Claude session (Q2c — long-lived tmux)
tmux new -s claude
cd ~/Smart-Smoker-V2
claude

# One-shot autonomous-style invocation
cd ~/Smart-Smoker-V2
claude --print --permission-mode bypassPermissions "<prompt>"

# Bring Mongo up/down
cd ~/Smart-Smoker-V2
docker compose -f dev.docker-compose.yml up -d
docker compose -f dev.docker-compose.yml down

# Refresh repo before a manual run
cd ~/Smart-Smoker-V2
git fetch origin master
git checkout master
git reset --hard origin/master
npm run bootstrap

# Rotate the GitHub PAT
echo "<new-token>" > ~/.config/claude-agent/gh-pat
chmod 600 ~/.config/claude-agent/gh-pat
gh auth login --with-token < ~/.config/claude-agent/gh-pat
gh auth setup-git
```
