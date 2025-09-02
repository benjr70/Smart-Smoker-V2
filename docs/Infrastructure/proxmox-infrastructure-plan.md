# Smart Smoker V2 - Proxmox Infrastructure as Code Plan

## Executive Summary

This document outlines the comprehensive plan to implement Infrastructure as Code (IaC) for the Smart Smoker V2 project using Terraform on a local Proxmox server. The initiative will enable automated deployment to development environments and provide manual deployment capabilities for production while maintaining the existing Raspberry Pi smoker device deployment strategy and current Tailscale networking.

## Project Goals

### Primary Objectives
- **Infrastructure as Code**: Implement Terraform to manage VM/LXC provisioning on Proxmox
- **Automated Dev Deployment**: Auto-deploy to development environment on master branch merges
- **Manual Production Control**: Provide controlled manual deployment to production environments
- **Tailscale Integration**: Automate Tailscale funnel configuration for public API exposure
- **Enhanced Testing**: Create virtual smoker device for complete application testing
- **Container Standardization**: Improve Docker image naming for Watchtower compatibility
- **Private Server Support**: Enable GitHub Actions deployment to local infrastructure

### Success Metrics
- ✅ 100% of infrastructure defined in Terraform code
- ✅ Development environment auto-deploys within 5 minutes of master merge
- ✅ Production cloud environment accessible via Tailscale funnel (https://smokecloud.tail74646.ts.net)
- ✅ Virtual smoker device provides full GUI testing capability via VNC
- ✅ Zero manual infrastructure provisioning for development
- ✅ Raspberry Pi continues auto-updating via Watchtower with improved container naming

## Current State Analysis

### Strengths
- ✅ Robust CI/CD pipeline with comprehensive testing
- ✅ Containerized applications with Docker Compose
- ✅ Dual deployment strategy (Cloud + Raspberry Pi)
- ✅ Tailscale networking with SSL and public funnel access
- ✅ Automatic updates via Watchtower on Pi
- ✅ Well-structured monorepo with 4 applications

### Current Tailscale Configuration
- **Frontend**: https://smokecloud.tail74646.ts.net → http://127.0.0.1:80
- **Backend**: https://smokecloud.tail74646.ts.net:8443 → http://127.0.0.1:3001
- **Portainer**: smokerCloudIp:10000 (internal access)

### Gaps
- ❌ Manual infrastructure provisioning
- ❌ Manual Tailscale configuration during deployments
- ❌ No development environment automation
- ❌ Container naming incompatible with Watchtower best practices
- ❌ Limited ability to test smoker hardware interactions
- ❌ GitHub Actions cannot reach private Proxmox server

## Target Architecture

### Infrastructure Layout
```
Proxmox Server
├── github-runner (LXC Container)
│   ├── Self-hosted GitHub Actions runner
│   ├── Terraform with Proxmox provider
│   ├── Docker CLI for deployment
│   ├── Tailscale client for network access
│   └── Node.js/npm for builds
│
├── smart-smoker-dev-cloud (LXC Container)
│   ├── Auto-deployed on master merge
│   ├── Backend + Frontend + MongoDB
│   ├── Environment variables injection
│   ├── Health monitoring
│   └── Internal Tailscale access (dev.smokecloud.tail74646.ts.net)
│
├── smart-smoker-cloud-prod (LXC Container)
│   ├── Manual deployment trigger
│   ├── Backend + Frontend + MongoDB
│   ├── Tailscale client with funnel configuration
│   ├── Production SSL certificates via Tailscale
│   ├── Public access: https://smokecloud.tail74646.ts.net
│   ├── Backend API: https://smokecloud.tail74646.ts.net:8443
│   ├── Portainer: Internal access on port 10000
│   └── Automated deployment workflow with Tailscale restart
│
└── smart-smoker-dev-smoker (VM - ARM64)
    ├── Raspberry Pi OS with desktop
    ├── VNC server for GUI access
    ├── Mock hardware devices (/dev/ttyUSB0, audio, etc.)
    ├── Device Service + Smoker UI + Electron Shell
    ├── Internal Tailscale network access
    └── Complete smoker simulation environment
```

## Implementation Phases

### [Phase 1: Container Standardization](phase-1-container-standardization.md)
**Duration**: 1-2 weeks  
**Focus**: Update Docker image naming and publishing workflows

### [Phase 2: Proxmox Infrastructure Setup](phase-2-proxmox-infrastructure.md)
**Duration**: 2-3 weeks  
**Focus**: Terraform infrastructure and GitHub runner setup

### [Phase 3: Deployment Automation](phase-3-deployment-automation.md)
**Duration**: 2-3 weeks  
**Focus**: Automated workflows and virtual smoker device

### [Phase 4: Testing & Documentation](phase-4-testing-and-documentation.md)
**Duration**: 1-2 weeks  
**Focus**: Validation, monitoring, and documentation

## Related Documentation

- [Phase 1: Container Standardization](phase-1-container-standardization.md)
- [Phase 2: Proxmox Infrastructure](phase-2-proxmox-infrastructure.md)
- [Phase 3: Deployment Automation](phase-3-deployment-automation.md)
- [Phase 4: Testing & Documentation](phase-4-testing-and-documentation.md)
- [Terraform Architecture](terraform-architecture.md)
- [Virtual Smoker Setup](virtual-smoker-setup.md)
- [Deployment Workflows](deployment-workflows.md)
- [Tailscale Network Configuration](tailscale-network-config.md)

---

**Document Version**: 1.0  
**Last Updated**: January 9, 2025  
**Status**: Planning Phase  
**Owner**: Development Team
