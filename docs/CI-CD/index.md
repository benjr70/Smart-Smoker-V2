# CI/CD & Deployment

This section covers Continuous Integration, Continuous Deployment, and infrastructure management for the Smart Smoker V2 project.

## Overview

The Smart Smoker V2 project uses a comprehensive CI/CD pipeline that includes:

- **Automated Testing**: GitHub Actions run tests on every PR
- **Container Deployment**: Docker containers deployed via watchtower and GitHub Actions
- **Network Management**: Tailscale for secure private networking
- **Monitoring**: Portainer for container management and monitoring

## Documentation Structure

### [GitHub Actions CI/CD](github-actions.md)
Comprehensive guide to the automated testing and deployment workflows:
- **Testing Pipeline**: Jest tests for all 4 applications and packages
- **Branch Protection**: Required status checks for PR merging
- **Parallel Execution**: Fast, efficient testing across the monorepo
- **Build Verification**: Frontend and Electron app build validation

### [Test Coverage Reports](test-coverage.md)
Complete guide to generating, viewing, and interpreting test coverage:
- **Coverage Generation**: Commands for all applications and packages
- **HTML Reports**: Interactive browser-based coverage dashboards
- **CI Integration**: Coverage reports in GitHub Actions
- **Best Practices**: Improving coverage quality and identifying gaps

### [Code Quality & Linting](code-quality.md)
Comprehensive guide to linting, formatting, and code quality tools:
- **ESLint & Prettier Setup**: Workspace-wide configuration for consistent code style
- **App-Specific Linting**: TypeScript, React, and NestJS best practices
- **VS Code Integration**: Auto-formatting and error detection
- **CI/CD Integration**: Automated code quality checks in GitHub Actions

### [Testing Library Migration Guide](testing-library-migration.md)
Systematic approach to fixing Testing Library rule violations:
- **240+ Violations Analysis**: Categories and priority ranking for fixes
- **Migration Strategy**: Phase-by-phase approach to modernize testing patterns
- **Best Practices**: Modern Testing Library patterns and anti-patterns to avoid
- **Implementation Timeline**: Structured 6-week plan for systematic improvements

### [Dependency Management](dependency-management.md)
Comprehensive guide to managing dependencies across the monorepo:
- **Clean Installation**: npm run clean and bootstrap processes
- **Workspace Management**: Using npm workspaces effectively
- **CI/CD Integration**: Package-lock.json management for reliable builds
- **Troubleshooting**: Common dependency issues and solutions

### [Deployment & Infrastructure](deployment-infrastructure.md)
Production deployment processes and infrastructure management:
- **Version Deployments**: Release process with GitHub tags
- **Container Orchestration**: Docker with watchtower auto-deployment
- **Network Configuration**: Tailscale setup and SSL management
- **Monitoring Setup**: Portainer installation and configuration

### [Manual Version Deployment](manual-version-deployment.md)
Runbook for deploying specific container versions to the cloud using GitHub Actions or local Docker Compose, including rollback and verification steps.

## Quick Reference

### CI Pipeline Status Checks
Every PR must pass these automated checks:
- `Run Jest Tests (backend)`
- `Run Jest Tests (device-service)`
- `Run Jest Tests (frontend)`
- `Run Jest Tests (smoker)`
- `Test Packages`
- `Code Quality Check` (linting & formatting)
- `Build Check (frontend)`
- `Build Check (smoker)`
- `All Tests Status`

### Deployment Environments

**Cloud Environment:**
- Frontend: https://smokecloud.tail74646.ts.net
- Backend: https://smokecloud.tail74646.ts.net:8443
- Deployed via GitHub Actions

**Smoker Environment:**
- Local Electron app + device service
- Deployed via Docker + watchtower
- Auto-updates from Docker Hub

### Development Workflow

1. **Create Feature Branch**: `feature/SS2-XX-description`
2. **Develop & Test Locally**: Run tests and code quality checks before pushing
3. **Code Quality**: Use `npm run check` for linting and formatting
4. **Create Pull Request**: CI automatically runs all tests and quality checks
5. **Code Review**: Requires approval + passing tests + code quality
6. **Merge to Master**: Triggers deployment workflows
7. **Production Release**: Tag version for container updates

## Architecture Diagram

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Developer     │    │   GitHub Actions │    │   Production    │
│                 │    │                  │    │                 │
│ • Local Dev     │───▶│ • Jest Tests     │───▶│ • Cloud Apps    │
│ • Feature Branch│    │ • Build Checks   │    │ • Smoker Device │
│ • Pull Request  │    │ • Deploy         │    │ • Monitoring    │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         │              ┌────────▼───────┐               │
         │              │  Branch Protect │               │
         └──────────────│ • Required Tests│◀──────────────┘
                        │ • Status Checks │
                        └────────────────┘
```

## Best Practices

### For Developers
- **Test Locally**: Run `npm test` before pushing
- **Code Quality**: Run `npm run check` for linting and formatting
- **Check CI Status**: Monitor Actions tab for test results
- **Fix Issues**: Address linting, formatting, and test failures before requesting review
- **Keep PRs Small**: Easier to review and test

### For DevOps
- **Monitor Deployments**: Check container health after releases
- **Update Dependencies**: Keep GitHub Actions and packages current
- **Backup Configs**: Maintain infrastructure as code
- **Security Updates**: Regular security scanning and updates

## Troubleshooting

### CI/CD Issues
- **Failed Tests**: Check logs in GitHub Actions tab
- **Deployment Failures**: Review workflow logs and container status
- **Network Issues**: Verify Tailscale configuration
- **Container Problems**: Use Portainer for monitoring and debugging

### Common Solutions
- **Test Failures**: Run tests locally to reproduce issues
- **Build Errors**: Check TypeScript compilation and dependencies
- **Deployment Stuck**: Restart watchtower or redeploy manually
- **Network Access**: Verify Tailscale funnel configuration

For detailed troubleshooting guides, see the individual documentation pages.
