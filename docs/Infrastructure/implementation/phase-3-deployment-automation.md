# Phase 3: Deployment Automation

## Overview

Phase 3 implements automated deployment workflows using GitHub Actions with the self-hosted runner infrastructure established in Phase 2. This phase covers CI/CD pipelines for both cloud environments and Raspberry Pi devices, integrating container naming conventions and Tailscale networking.

## Goals

- **Automated CI/CD**: GitHub Actions workflows for all deployment targets
- **Multi-Environment Deployment**: Dev and production environments with appropriate gates
- **Raspberry Pi Integration**: Automated deployment to physical devices
- **Security & Reliability**: Secure deployments with health checks and rollback
- **Monitoring**: Deployment status notifications via Discord

## CI/CD Pipeline

```
Feature Branch → PR Checks (lint, test, build)
                        ↓ merge to master
Master Merge → nightly.yml (build :nightly images)
                        ↓ workflow_run trigger
               dev-deploy.yml
                  ├── Deploy to dev-cloud (Backend, Frontend, MongoDB)
                  ├── Deploy to virtual-smoker-device (Device-service, Smoker, Electron-shell)
                  └── Discord notification

Manual Release → release.yml (workflow_dispatch or GitHub Release)
                  ├── Build & publish versioned images
                  ├── Deploy to prod-cloud (Tailscale funnel for public access)
                  └── Deploy to production Pi

Production Pi → Watchtower auto-updates when device comes online
```

## GitHub Issues

All remaining Phase 3 work is tracked as GitHub Issues under the [Phase 3: Deployment Automation](https://github.com/benjr70/Smart-Smoker-V2/milestone/1) milestone:

| Issue | Title | Status |
|-------|-------|--------|
| [#168](https://github.com/benjr70/Smart-Smoker-V2/issues/168) | Virtual Smoker Device Infrastructure (Story 2) | In Progress |
| [#169](https://github.com/benjr70/Smart-Smoker-V2/issues/169) | Production Deployment Workflow (Story 4) | Planned |
| [#170](https://github.com/benjr70/Smart-Smoker-V2/issues/170) | Production Database Migration (Story 5) | Planned |
| [#171](https://github.com/benjr70/Smart-Smoker-V2/issues/171) | Watchtower Post-Update Monitoring (Story 6) | Planned |
| [#172](https://github.com/benjr70/Smart-Smoker-V2/issues/172) | E2E Testing Framework (Story 7) | Deferred |

## Completed Work

- **Story 0**: Critical Infrastructure Fixes -- MongoDB 7.x upgrade, authentication, automated backups, health checks, rollback automation. Branch: `feat/infra-phase3-story-0`.
- **Story 1**: Automated Dev Deployment -- `dev-deploy.yml` triggers on nightly build, deploys to dev-cloud and virtual-smoker-device, Discord notifications.
- **Story 3**: Virtual Smoker Device Deployment -- `device-deploy.yml` reusable workflow with health checks and rollback. Code complete, verification included in Story 2.

## Reference Documentation

Detailed implementation references have been moved to separate docs:

- [Migration Runbook](phase-3-reference/migration-runbook.md) -- Full database migration procedure (Story 5)
- [Workflow Architecture](phase-3-reference/workflow-architecture.md) -- Pipeline diagrams, workflow inventory, example patterns
- [Scripts Reference](phase-3-reference/scripts-reference.md) -- Health check, device update, and integration test script patterns

## Key Workflow Files

| Workflow | Purpose |
|----------|---------|
| `nightly.yml` | Builds :nightly Docker images on push to master |
| `dev-deploy.yml` | Deploys to dev-cloud + virtual-smoker on nightly completion |
| `device-deploy.yml` | Reusable device deployment (SSH, health checks, rollback) |
| `cloud-deploy.yml` | Reusable cloud deployment (health checks, rollback) |
| `release.yml` | Production release: build, publish, deploy |
| `smoker-deploy.yml` | Production Pi deployment |
| `infra-provision-vm.yml` | Provisions virtual smoker VM (Terraform + Ansible) |

## Success Metrics

- **< 10 minutes** for development deployments
- **< 30 minutes** for production deployments
- **< 5 minutes** mean time to rollback
- **99%** deployment success rate
- **100%** infrastructure provisioned via automation

---

**Phase Owner**: DevOps Team
**Dependencies**: Phase 2 completion
