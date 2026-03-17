# Phase 3: Workflow Architecture Reference

## Deployment Pipeline Overview

```
GitHub Repository
├── Feature Branch Push (PR)
│   ├── Lint & Test (GitHub Hosted)
│   └── PR checks must pass before merge
│
├── Master Branch Merge
│   ├── nightly.yml (builds :nightly images)
│   ├── dev-deploy.yml (triggered on nightly completion)
│   │   ├── Deploy to dev-cloud (Proxmox LXC)
│   │   │   └── Backend, Frontend, MongoDB
│   │   ├── Deploy to virtual-smoker-device (Proxmox VM)
│   │   │   └── Device-service, Smoker, Electron-shell
│   │   ├── Health checks
│   │   └── Discord notifications
│   └── E2E Testing (DEFERRED)
│
├── Production Release (Manual)
│   ├── Manual Approval Required (workflow_dispatch)
│   ├── Build production images (versioned tags)
│   ├── Deploy to prod-cloud (Proxmox LXC)
│   │   ├── Tailscale funnel setup (public access)
│   │   └── Health checks + rollback
│   ├── Deploy to production Raspberry Pi
│   └── Send Notifications
│
└── Production Pi Updates
    └── Watchtower (automatic updates when Pi comes online)
```

## Deployment Targets

```
Deployment Infrastructure
├── Cloud Environments (Proxmox)
│   ├── Development (smoker-dev-cloud)
│   │   ├── Auto-deploy on master merge
│   │   ├── :nightly container images
│   │   ├── Tailscale internal access
│   │   └── Discord deployment notifications
│   │
│   └── Production (smokecloud)
│       ├── Manual deployment approval
│       ├── Tagged stable releases (vX.Y.Z)
│       ├── Health monitoring + rollback
│       ├── Tailscale funnel (public access)
│       └── Automated backups
│
├── Physical Devices (Raspberry Pi)
│   └── Production Smokers
│       ├── Watchtower auto-updates
│       ├── Standardized container names
│       └── Remote management via Tailscale
│
└── Virtual Testing (Proxmox VM)
    ├── virtual-smoker-device
    ├── Deployed alongside dev-cloud
    └── Device-service in emulator mode
```

## Development Pipeline (Master Merge)

```
Master Branch Merge
    ↓
nightly.yml (builds :nightly images for all apps)
    ↓
dev-deploy.yml (triggered by workflow_run)
    ↓
┌─────────────────────────────────┐
│ deploy-dev-cloud                │
│ (inline deployment steps)       │
│ - Deploy to smart-smoker-dev-cloud│
│ - Backend, Frontend, MongoDB    │
│ - Health checks + rollback      │
│ - Tailscale Serve config        │
└─────────────────────────────────┘
    ↓
┌─────────────────────────────────┐
│ deploy-virtual-smoker           │
│ (calls device-deploy.yml)       │
│ - Deploy to virtual-smoker-device│
│ - Device-service, Smoker, Shell │
│ - Health checks + rollback      │
└─────────────────────────────────┘
    ↓
┌─────────────────────────────────┐
│ notify                          │
│ - Discord webhook notification  │
│ - Reports both deploy statuses  │
└─────────────────────────────────┘
```

## Production Pipeline (Manual Trigger)

```
Manual Production Release (workflow_dispatch or GitHub Release)
    ↓
release.yml
    ↓
┌─────────────────────────────────┐
│ set-version                     │
│ - Normalize version from input  │
│   or release tag                │
└─────────────────────────────────┘
    ↓
┌─────────────────────────────────┐
│ build + publish                 │
│ - Build all apps (build.yml)    │
│ - Build & push Docker images    │
│   (publish.yml)                 │
│ - Tag with version              │
└─────────────────────────────────┘
    ↓
┌─────────────────────────────────┐
│ deploy-cloud (optional)         │
│ (cloud-deploy.yml with version) │
│ - Deploy to prod-cloud LXC      │
│ - Health checks + rollback      │
└─────────────────────────────────┘
    ↓
┌─────────────────────────────────┐
│ deploy-smoker (optional)        │
│ (smoker-deploy.yml)             │
│ - Deploy to production Pi       │
│ - NOTE: No health checks yet    │
└─────────────────────────────────┘
```

## Workflow File Inventory

| Workflow | Type | Purpose |
|----------|------|---------|
| `nightly.yml` | Trigger: push to master | Builds all apps, publishes :nightly Docker images |
| `dev-deploy.yml` | Trigger: nightly completion | Orchestrates dev-cloud + virtual-smoker deployment |
| `device-deploy.yml` | Reusable (workflow_call) | Deploys to any smoker device via SSH |
| `cloud-deploy.yml` | Reusable (workflow_call) | Deploys to cloud LXC (runs on target runner) |
| `release.yml` | Trigger: manual / release | Production release: build, publish, deploy |
| `smoker-deploy.yml` | Reusable (workflow_call) | Deploys to production Pi (runs on target runner) |
| `deploy-version.yml` | Trigger: manual | Deploy a specific version to cloud and/or smoker |
| `publish.yml` | Reusable (workflow_call) | Builds and publishes Docker images |
| `build.yml` | Reusable (workflow_call) | Builds applications (no Docker) |
| `infra-provision-vm.yml` | Trigger: manual | Provisions virtual smoker VM (Terraform + Ansible) |
| `ansible-provision.yml` | Trigger: manual | Runs Ansible playbooks for infra provisioning |
| `ci-tests.yml` | Trigger: PR | CI testing |
| `ansible-lint.yml` | Trigger: PR | Ansible linting |
| `terraform-validate.yml` | Trigger: PR | Terraform validation |

## Example Workflow Patterns

These are reference patterns from the original planning doc. The actual implemented workflows may differ -- always check the `.github/workflows/` directory for current state.

### Development Workflow Pattern

```yaml
name: Development CI/CD

on:
  push:
    branches: [ master ]
  pull_request:
    branches: [ master ]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm run test:ci
      - run: npm run build

  build-images:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/master'
    strategy:
      matrix:
        service: [backend, frontend, device-service, smoker]
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}
      - uses: docker/build-push-action@v5
        with:
          context: ./apps/${{ matrix.service }}
          push: true
          tags: |
            benjr70/smart-smoker-${{ matrix.service }}:dev-latest
            benjr70/smart-smoker-${{ matrix.service }}:dev-${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  deploy-dev:
    needs: [test, build-images]
    runs-on: self-hosted
    if: github.ref == 'refs/heads/master'
    steps:
      - uses: actions/checkout@v4
      - name: Deploy to development environment
        run: |
          export DEV_HOST="smoker-dev-cloud"
          scp cloud.docker-compose.yml root@${DEV_HOST}:/opt/smart-smoker/
          ssh root@${DEV_HOST} "cd /opt/smart-smoker && docker-compose pull && docker-compose up -d"
          sleep 30
          ./scripts/health-check.sh ${DEV_HOST}
```

### Production Workflow Pattern

```yaml
name: Production Deployment

on:
  workflow_dispatch:
    inputs:
      version:
        description: 'Version to deploy'
        required: true
        type: string

jobs:
  approval:
    runs-on: ubuntu-latest
    environment:
      name: production
    steps:
      - run: echo "Deployment approved"

  deploy-cloud:
    needs: approval
    runs-on: self-hosted
    steps:
      - uses: actions/checkout@v4
      - name: Backup current deployment
        run: |
          ssh root@${PROD_HOST} "cd /opt/smart-smoker && cp cloud.docker-compose.yml cloud.docker-compose.yml.backup"
      - name: Deploy to production cloud
        run: |
          scp cloud.docker-compose.yml root@${PROD_HOST}:/opt/smart-smoker/
          ssh root@${PROD_HOST} "cd /opt/smart-smoker && docker-compose pull && docker-compose up -d"
          sleep 60
      - name: Verify deployment health
        run: ./scripts/health-check.sh ${PROD_HOST}

  rollback:
    needs: deploy-cloud
    runs-on: self-hosted
    if: failure()
    steps:
      - name: Rollback deployment
        run: |
          ssh root@${PROD_HOST} "cd /opt/smart-smoker && cp cloud.docker-compose.yml.backup cloud.docker-compose.yml"
          ssh root@${PROD_HOST} "cd /opt/smart-smoker && docker-compose up -d"
          sleep 30
          ./scripts/health-check.sh ${PROD_HOST}
```

### Raspberry Pi Update Workflow Pattern

```yaml
name: Raspberry Pi Device Updates

on:
  workflow_dispatch:
    inputs:
      target_devices:
        description: 'Target devices (all, production, development)'
        required: true
        default: 'production'
        type: choice
        options: [all, production, development]
      update_strategy:
        description: 'Update strategy'
        required: true
        default: 'rolling'
        type: choice
        options: [rolling, immediate, scheduled]

jobs:
  update-devices:
    runs-on: self-hosted
    steps:
      - uses: actions/checkout@v4
      - name: Discover Raspberry Pi devices
        run: |
          tailscale status --json | jq -r '.Peer[] | select(.HostName | contains("smoker-pi")) | .HostName' > pi-devices.txt
      - name: Update devices
        run: |
          while IFS= read -r device; do
            ./scripts/update-single-device.sh "$device"
            ./scripts/health-check-device.sh "$device"
            sleep 120
          done < target-devices.txt
```

## Monitoring & Alerting

### Deployment Monitoring (Future)

Potential monitoring dashboard panels:
- Deployment success/failure rate
- Environment health status
- Raspberry Pi device status
- Deployment duration trends

### Notification Templates

Discord notifications are implemented in `dev-deploy.yml` with:
- Color-coded embeds (green/yellow/red)
- Per-target deployment status
- Workflow run URL
- Version information

Production notifications (Story 4) should follow the same pattern.

## Security Checklist

- [ ] All container images scanned for vulnerabilities
- [ ] Secrets stored in GitHub Secrets, not in code
- [ ] Deployment approvals required for production
- [ ] All deployment activities logged
- [ ] Tailscale provides encrypted communication
- [ ] Automated backups before each deployment
- [ ] Rollback procedures tested regularly
