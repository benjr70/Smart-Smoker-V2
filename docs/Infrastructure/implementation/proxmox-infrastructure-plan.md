# Smart Smoker V2 - Proxmox Infrastructure as Code Plan

## Executive Summary

This document outlines the comprehensive plan to implement Infrastructure as Code (IaC) for the Smart Smoker V2 project using Terraform on a local Proxmox server. The initiative will enable automated deployment to development environments and provide manual deployment capabilities for production while maintaining the existing Raspberry Pi smoker device deployment strategy and current Tailscale networking.

**Architectural Review Update (2025-10-14)**: Following a comprehensive architectural review, this plan has been updated to include Architecture Decision Records (ADRs), risk assessments, and adjusted implementation priorities. Critical security and reliability issues have been identified and prioritized for immediate remediation in Phase 3.

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

### Critical Issues (Architectural Review Findings)
- ❌ **MongoDB Security**: Running 4.4.14-rc0 (release candidate) without authentication
- ❌ **Backup System**: No automated backups or restore validation
- ❌ **Deployment Safety**: No automated health checks or rollback mechanisms
- ❌ **State Management**: Local Terraform state with no locking (acceptable for single-user)
- ❌ **Single Point of Failure**: All infrastructure on one Proxmox server (acceptable trade-off)

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
**Status**: Completed

### [Phase 2: Proxmox Infrastructure Setup](phase-2-proxmox-infrastructure.md)
**Duration**: 2-3 weeks
**Focus**: Terraform infrastructure and GitHub runner setup
**Status**: ✅ Complete (3/4 stories - Story 4 deferred to Phase 4)
**Key Additions**: Architecture Decision Records (ADRs), risk assessment, evolution path
**Note**: Virtual smoker device (Story 4) moved to Phase 4 as it's testing infrastructure

### [Phase 3: Deployment Automation](phase-3-deployment-automation.md)
**Duration**: 3-4 weeks (EXTENDED)
**Focus**: **PRIORITY ADJUSTED** - Security fixes, backup automation, then deployment workflows
**Status**: In Progress - Critical fixes prioritized
**Critical Changes**:
- **Story 0 (NEW)**: MongoDB security upgrade, automated backups, deployment safety - MUST COMPLETE FIRST
- **Story 3 (UPDATED)**: Production database migration - requires Story 0 completion
- Risk-adjusted implementation order focusing on security and reliability before advanced automation

### [Phase 4: Testing & Documentation](phase-4-testing-and-documentation.md)
**Duration**: 1-2 weeks
**Focus**: Validation, monitoring, documentation, and virtual device testing
**Status**: Planned
**Additions**: Virtual smoker device setup (moved from Phase 2, Story 4)

## Architectural Principles & Trade-offs

This infrastructure is designed with specific principles reflecting its context as a single-developer, personal project:

### Design Principles
1. **Simplicity over Complexity**: Choose simpler solutions even if they're less "enterprise-grade"
2. **Cost Efficiency**: Prioritize zero-cost local infrastructure over cloud services
3. **Learning Focus**: Balance production readiness with learning opportunities
4. **Pragmatic Security**: Address critical risks, accept reasonable trade-offs
5. **Evolutionary Design**: Start simple, add complexity only when needed

### Conscious Trade-offs
- **High Availability**: Single server acceptable for personal project (vs multi-node cluster)
- **Zero-Downtime**: Brief maintenance windows acceptable (vs complex blue-green deployments)
- **State Management**: Local Terraform state acceptable for single user (vs remote backend with locking)
- **Backup Strategy**: Daily backups sufficient (vs real-time replication)
- **Monitoring**: Basic monitoring adequate (vs enterprise observability stack)

### Non-Negotiable Requirements
- **Data Safety**: Must have automated backups and tested restore procedures
- **Security**: Must secure database with authentication, keep systems patched
- **Recoverability**: Must be able to rebuild infrastructure from code and backups
- **Documentation**: Must document all procedures for future reference

For detailed architectural decisions, see [Phase 2 ADR Section](phase-2-proxmox-infrastructure.md#architecture-decision-records-adr).

## Related Documentation

- [Phase 1: Container Standardization](phase-1-container-standardization.md)
- [Phase 2: Proxmox Infrastructure](phase-2-proxmox-infrastructure.md)
- [Phase 3: Deployment Automation](phase-3-deployment-automation.md)
- [Phase 4: Testing & Documentation](phase-4-testing-and-documentation.md)
- [Terraform Architecture](terraform-architecture.md)
- [Virtual Smoker Setup](virtual-smoker-setup.md)
- [Deployment Workflows](deployment-workflows.md)
- [Tailscale Network Configuration](tailscale-network-config.md)

## Current Status & Next Steps (2025-11-25)

### Infrastructure Status
- **Phase 1**: ✅ Complete - Container standardization implemented
- **Phase 2**: ✅ Complete - Infrastructure provisioned with Terraform and Ansible, Tailscale mesh operational (3/4 stories complete, virtual smoker deferred to Phase 4)
- **Phase 3**: 🚀 Ready to Start - Security fixes prioritized before automation
- **Phase 4**: ⏸️ Planned - Testing, documentation, and virtual smoker device

### Immediate Next Steps (Priority Order)

**Critical (Complete First - Weeks 1-2)**:
1. Upgrade MongoDB from 4.4.14-rc0 to 7.x stable in dev environment
2. Enable MongoDB authentication with service accounts
3. Implement automated backup system for LXC containers and MongoDB
4. Add deployment health checks with automated rollback
5. Test all fixes thoroughly in dev environment

**High Priority (Weeks 3-5)**:
6. Apply MongoDB upgrade to Raspberry Pi production
7. Migrate production database from Pi to Proxmox
8. Validate migration and monitor for stability
9. Update deployment workflows with new security measures

**Standard Priority (Weeks 6+)**:
10. Implement automated development deployment
11. Add production deployment automation with approval gates
12. Set up Raspberry Pi device management
13. Complete virtual device testing automation

### Key Architectural Insights

From the comprehensive architectural review:

**Strengths**:
- Excellent cost efficiency (near-zero monthly infrastructure costs)
- Good separation of concerns (Terraform + Ansible)
- Appropriate simplicity for single-developer context
- Solid foundation for future growth

**Critical Issues Identified**:
- MongoDB security vulnerability (no auth, old version) - IMMEDIATE FIX REQUIRED
- Missing automated backup system - HIGH PRIORITY
- No deployment safety mechanisms - HIGH PRIORITY

**Pragmatic Acceptance**:
- Single point of failure (single Proxmox server) - ACCEPTABLE for current scale
- Local Terraform state - ACCEPTABLE for single operator
- Basic monitoring - ACCEPTABLE, enhance later if needed

**Architecture Philosophy**:
This infrastructure optimizes for simplicity, cost, and learning over enterprise-grade high availability and scale. All architectural decisions are documented in ADRs within Phase 2 documentation.

---

**Document Version**: 2.0
**Last Updated**: October 14, 2025
**Status**: Implementation Phase (Phase 3 - Critical Fixes)
**Owner**: Development Team
**Next Review**: After Phase 3 Story 0 completion
