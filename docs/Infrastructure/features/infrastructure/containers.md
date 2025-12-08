# Container Standardization

## Overview

All Docker containers follow a standardized naming convention for Watchtower compatibility and version control. This document covers container naming, tagging strategy, and image management.

## Container Naming Convention

### New Naming (Standardized)

```
benjr70/smart-smoker-backend:latest
benjr70/smart-smoker-backend:v1.2.3
benjr70/smart-smoker-backend:nightly

benjr70/smart-smoker-frontend:latest
benjr70/smart-smoker-frontend:v1.2.3
benjr70/smart-smoker-frontend:nightly

benjr70/smart-smoker-device-service:latest
benjr70/smart-smoker-device-service:v1.2.3
benjr70/smart-smoker-device-service:nightly

benjr70/smart-smoker-smoker:latest
benjr70/smart-smoker-smoker:v1.2.3
benjr70/smart-smoker-smoker:nightly

benjr70/smart-smoker-electron-shell:latest
benjr70/smart-smoker-electron-shell:v1.2.3
benjr70/smart-smoker-electron-shell:nightly
```

### Benefits

- ✅ Watchtower can update `:latest` tags automatically
- ✅ Separate repository per service for clarity
- ✅ Semantic versioning with `v` prefix
- ✅ Consistent hyphen-separated naming
- ✅ Clear environment strategy

## Tagging Strategy

### Floating Tags

- **`nightly`**: Development builds (auto-deployed on master merge)
- **`latest`**: Production releases (used by Watchtower on Raspberry Pi)

### Immutable Tags

- **`vX.Y.Z`**: Semantic version tags (never re-used, for rollback)
- **`vX.Y`**: Minor version tags (optional)
- **`vX`**: Major version tags (optional)

### Promotion Flow

1. Build once on master merge → push `:nightly`
2. When cutting a release, retag the same image digest to `:vX.Y.Z` and `:latest`
3. Verify `:vX.Y.Z` and `:latest` point to the same digest for that release

**Why This Matters**:
- **Rollback**: Switch to `:vX.Y.Z` instantly; floating tags move
- **Reproducibility**: Exact artifacts for audits and bug reproduction
- **Operational Clarity**: Dev uses `:nightly`, smoker uses `:latest`, cloud prod pins `:vX.Y.Z`

## Watchtower Integration

### Raspberry Pi Auto-Updates

Watchtower on Raspberry Pi devices automatically updates containers using `:latest` tags:

```yaml
# docker-compose.yml on Raspberry Pi
services:
  backend:
    image: benjr70/smart-smoker-backend:latest
    # Watchtower monitors this and updates automatically
```

### Watchtower Configuration

```yaml
watchtower:
  image: containrrr/watchtower
  volumes:
    - /var/run/docker.sock:/var/run/docker.sock
  environment:
    - WATCHTOWER_CLEANUP=true
    - WATCHTOWER_POLL_INTERVAL=3600
```

## Environment Tag Usage

### Development

**Tag**: `nightly`  
**Deployment**: Auto-deploy on master merge  
**Location**: dev-cloud

```yaml
services:
  backend:
    image: benjr70/smart-smoker-backend:nightly
```

### Production (Cloud)

**Tag**: `vX.Y.Z` (pinned versions)  
**Deployment**: Manual deployment with approval  
**Location**: prod-cloud

```yaml
services:
  backend:
    image: benjr70/smart-smoker-backend:v1.2.3
```

### Production (Raspberry Pi)

**Tag**: `latest` (Watchtower auto-updates)  
**Deployment**: Automatic via Watchtower  
**Location**: Raspberry Pi devices

```yaml
services:
  backend:
    image: benjr70/smart-smoker-backend:latest
```

## Image Management

### Building Images

```bash
# Build all images
docker compose -f docker-compose.build.yml build

# Build specific service
docker compose -f docker-compose.build.yml build backend
```

### Tagging Images

```bash
# Tag for nightly
docker tag benjr70/smart-smoker-backend:build benjr70/smart-smoker-backend:nightly

# Tag for release
docker tag benjr70/smart-smoker-backend:build benjr70/smart-smoker-backend:v1.2.3
docker tag benjr70/smart-smoker-backend:build benjr70/smart-smoker-backend:latest
```

### Publishing Images

```bash
# Push nightly
docker push benjr70/smart-smoker-backend:nightly

# Push release tags
docker push benjr70/smart-smoker-backend:v1.2.3
docker push benjr70/smart-smoker-backend:latest
```

## Version Management

### Semantic Versioning

Follow [Semantic Versioning](https://semver.org/):
- **MAJOR**: Incompatible API changes
- **MINOR**: Backward-compatible functionality
- **PATCH**: Backward-compatible bug fixes

### Version Tags

```bash
# Create version tag
git tag -a v1.2.3 -m "Release version 1.2.3"
git push origin v1.2.3

# GitHub Actions automatically:
# 1. Builds images
# 2. Tags with v1.2.3 and latest
# 3. Pushes to registry
```

## Rollback Strategy

### Using Version Tags

```bash
# Rollback to specific version
docker compose -f cloud.docker-compose.yml pull benjr70/smart-smoker-backend:v1.2.2
docker compose -f cloud.docker-compose.yml up -d backend
```

### Using Deployment Backup

See [Rollback](../deployment/rollback.md) for automated rollback procedures.

## Best Practices

### Image Naming

1. **Use Hyphens**: `smart-smoker-backend` not `smart_smoker_backend`
2. **Be Descriptive**: Clear service names
3. **Consistent**: Same pattern across all services

### Tag Management

1. **Never Re-tag**: Immutable tags (`vX.Y.Z`) should never change
2. **Promote, Don't Rebuild**: Retag same digest for releases
3. **Document Versions**: Keep changelog of versions

### Watchtower

1. **Use `:latest`**: Only for Watchtower auto-updates
2. **Pin in Production**: Use version tags for production cloud
3. **Test Updates**: Verify Watchtower updates work correctly

## Related Documentation

- [Deployment Automation](../deployment/automation.md) - CI/CD workflows
- [Environments](../deployment/environments.md) - Environment configuration
- [Terraform Configuration](terraform.md) - Infrastructure setup

---

**Last Updated**: 2025-12-07



