# Infrastructure Documentation

## Overview

This documentation covers all aspects of Smart Smoker V2 infrastructure, organized by feature for easy navigation.

## Quick Links

- [Getting Started](guides/getting-started.md) - Quick start guide
- [Architecture](guides/architecture.md) - System architecture overview

## Features

### Database

- [MongoDB](features/database/mongodb.md) - MongoDB configuration and authentication
- [Backups](features/database/backups.md) - Automated backup system

### Deployment

- [Automation](features/deployment/automation.md) - CI/CD and deployment workflows
- [Health Checks](features/deployment/health-checks.md) - Docker health check configuration
- [Rollback](features/deployment/rollback.md) - Deployment rollback procedures
- [Environments](features/deployment/environments.md) - Environment configuration

### Infrastructure

- [Terraform](features/infrastructure/terraform.md) - Infrastructure provisioning
- [Proxmox](features/infrastructure/proxmox.md) - Proxmox infrastructure setup
- [Containers](features/infrastructure/containers.md) - Container standardization

### Configuration

- [Ansible](features/configuration/ansible.md) - Ansible operations and playbooks
- [System Setup](features/configuration/system-setup.md) - Base system configuration

### Networking

- [Tailscale](features/networking/tailscale.md) - Tailscale setup and troubleshooting
- [Network Config](features/networking/network-config.md) - Network configuration

### Security

- [Secrets Management](features/security/secrets-management.md) - Secrets and credential management
- [Authentication](features/security/authentication.md) - Authentication configuration

### Operations

- [Testing](features/operations/testing.md) - Testing infrastructure and procedures
- [Disaster Recovery](features/operations/disaster-recovery.md) - Recovery procedures
- [Monitoring](features/operations/monitoring.md) - Health monitoring and logging

## Documentation Structure

Documentation is organized by feature rather than by phase/story to make it easier to find information about specific functionality.

Each feature document is self-contained and includes:
- Overview
- Configuration
- Usage
- Troubleshooting
- Related documentation

## Contributing

When adding new infrastructure features:
1. Create documentation in appropriate feature directory
2. Update this README with link to new documentation
3. Update mkdocs.yml navigation
4. Cross-reference related features

---

**Last Updated**: 2025-12-07



