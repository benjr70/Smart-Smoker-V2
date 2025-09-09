# Phase 1: Container Standardization

## Overview

Phase 1 focuses on standardizing Docker image naming conventions and updating publishing workflows to make them compatible with Watchtower auto-updates while maintaining version control for manual deployments. This phase also introduces a clear tag strategy for environments: dev deploys use a `nightly` tag, production releases update the `latest` tag (used by Watchtower on smoker devices), and all releases are also published with immutable `vX.Y.Z` tags for rollback.

## Goals & Objectives

### Primary Goals
- **Standardize Container Naming**: Implement consistent naming across all Docker images
- **Watchtower Compatibility**: Enable automatic updates on Raspberry Pi using `:latest` tags
- **Version Control**: Maintain semantic versioning for manual deployments
- **Workflow Updates**: Modify GitHub Actions publish workflows
- **Environment Tag Strategy**: Adopt `nightly` for dev, `latest` for production, with immutable `vX.Y.Z`

### Success Criteria
- ✅ All containers follow new naming convention
- ✅ Watchtower successfully updates containers on Pi
- ✅ Both `:latest` and versioned tags published automatically
- ✅ No disruption to existing deployments during transition

## Current vs. New Naming Convention

### Current Naming (Problematic)
```
benjr70/smart_smoker:backend_V1.2.3
benjr70/smart_smoker:frontend_V1.2.3
benjr70/smart_smoker:device-service_V1.2.3
benjr70/smart_smoker:smoker_V1.2.3
benjr70/smart_smoker:electron-shell_V1.2.3
```

**Problems:**
- Version in tag name prevents Watchtower auto-updates
- Single repository for all services
- Inconsistent naming patterns

### New Naming (Solution)
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

**Benefits:**
- ✅ Watchtower can update `:latest` tags automatically
- ✅ Separate repository per service for clarity
- ✅ Semantic versioning with `v` prefix
- ✅ Consistent hyphen-separated naming
- ✅ Clear environment strategy: `nightly` → dev, `latest` → prod smoker, `vX.Y.Z` → rollback

### Tagging & Promotion Strategy (Best Practice)

- **Floating tags**: `nightly` (dev), `latest` (production smoker via Watchtower)
- **Immutable tags**: `vX.Y.Z` for every release (never re-used)
- **Optional convenience tags**: `vX.Y` and `vX` for minor/major pinning
- **Optional traceability tags**: `sha-<shortsha>` or OCI annotations
- **Promotion flow (no rebuild)**:
  1) Build once on master merge → push `:nightly`
  2) When cutting a release, retag the same image digest to `:vX.Y.Z` and `:latest`
  3) Verify `:vX.Y.Z` and `:latest` point to the same digest for that release

Why this matters
- **Rollback**: switch to `:vX.Y.Z` instantly; floating tags move
- **Reproducibility**: exact artifacts for audits and bug reproduction
- **Operational clarity**: dev uses `:nightly`, smoker uses `:latest`, cloud prod pins `:vX.Y.Z`

## User Stories

### Story 1: Watchtower Auto-Updates
**As a** system administrator  
**I want** Watchtower to automatically update smoker containers  
**So that** the Pi stays current without manual intervention

**Acceptance Criteria:**
- Watchtower detects new `:latest` tags
- Containers restart with new versions automatically
- No manual intervention required for updates
- Rollback possible using versioned tags
 - Dev environment receives `nightly` images on master merges

### Story 2: Manual Version Deployment
**As a** developer  
**I want** to deploy specific versions to production  
**So that** I can control exactly what version runs in production

**Acceptance Criteria:**
- Specific version tags available (e.g., `v1.2.3`)
- Can deploy any historical version
- Version tags never change once published
- Clear version history in Docker Hub

### Story 3: Development Workflow
**As a** developer  
**I want** the publishing workflow to be automatic  
**So that** I don't need to manually manage container names

**Acceptance Criteria:**
- GitHub Actions automatically publishes both tags
- No manual intervention in publishing process
- Consistent naming across all services
- Failed publishes don't break existing containers

## Technical Requirements

### Docker Hub Repository Structure
```
Docker Hub Organization: benjr70/
├── smart-smoker-backend/
│   ├── latest (always newest)
│   ├── v1.0.0
│   ├── v1.1.0
│   └── v1.2.0
├── smart-smoker-frontend/
├── smart-smoker-device-service/
├── smart-smoker-smoker/
└── smart-smoker-electron-shell/
```

### GitHub Actions Workflow Changes

#### Release publish (latest + version)
```yaml
- name: Build and push ${{ matrix.app }} Docker image
  uses: docker/build-push-action@v5
  with:
    platforms: ${{ matrix.platform }}
    context: .
    file: |
      ${{ 
        matrix.app == 'backend' && 'apps/backend/Dockerfile' ||
        matrix.app == 'device-service' && 'apps/device-service/Dockerfile' ||
        matrix.app == 'frontend' && 'apps/frontend/Dockerfile' ||
        matrix.app == 'smoker' && 'apps/smoker/Dockerfile' ||
        matrix.app == 'electron-shell' && 'apps/smoker/shell.dockerfile' ||
        ''
      }}
    push: true
    tags: |
      ${{ secrets.DOCKERHUB_USERNAME }}/smart-smoker-${{ matrix.app }}:latest
      ${{ secrets.DOCKERHUB_USERNAME }}/smart-smoker-${{ matrix.app }}:v${{ inputs.version }}
```

#### Nightly publish (on merge to master)
On merges to `master`, build and push `nightly` tags for all services. This powers automatic dev deployments.

```yaml
- name: Build and push nightly ${{ matrix.app }} image
  uses: docker/build-push-action@v5
  with:
    platforms: ${{ matrix.platform }}
    context: .
    file: |
      ${{ 
        matrix.app == 'backend' && 'apps/backend/Dockerfile' ||
        matrix.app == 'device-service' && 'apps/device-service/Dockerfile' ||
        matrix.app == 'frontend' && 'apps/frontend/Dockerfile' ||
        matrix.app == 'smoker' && 'apps/smoker/Dockerfile' ||
        matrix.app == 'electron-shell' && 'apps/smoker/shell.dockerfile' ||
        ''
      }}
    push: true
    tags: |
      ${{ secrets.DOCKERHUB_USERNAME }}/smart-smoker-${{ matrix.app }}:nightly
```

#### Release tagging (promote nightly to version + latest)
Promote the same multi-arch image (by digest) to `vX.Y.Z` and `latest` without rebuilding.

```yaml
- name: Tag release images without rebuild
  run: |
    for app in backend device-service frontend smoker electron-shell; do
      docker pull ${{ secrets.DOCKERHUB_USERNAME }}/smart-smoker-$app:nightly
      digest=$(docker inspect --format='{{index .RepoDigests 0}}' ${{ secrets.DOCKERHUB_USERNAME }}/smart-smoker-$app:nightly | cut -d'@' -f2)
      docker buildx imagetools create \
        -t ${{ secrets.DOCKERHUB_USERNAME }}/smart-smoker-$app:v${{ inputs.version }} \
        -t ${{ secrets.DOCKERHUB_USERNAME }}/smart-smoker-$app:latest \
        ${{ secrets.DOCKERHUB_USERNAME }}/smart-smoker-$app@${digest}
    done
```

### Docker Compose Updates

#### cloud.docker-compose.yml
```yaml
version: '3.1'
services:
  backend:
    container_name: backend_cloud
    image: benjr70/smart-smoker-backend:${VERSION:-latest}
    # ... rest of config

  frontend:
    container_name: frontend_cloud
    image: benjr70/smart-smoker-frontend:${VERSION:-latest}
    # ... rest of config

  mongo:
    container_name: mongo
    image: mongo:4.4.14-rc0-focal
    # ... unchanged
```

Dev deployment uses `VERSION=nightly` so the cloud dev environment always runs the latest nightly images. Production cloud deployments use `VERSION=vX.Y.Z` to pin a specific release.

#### smoker.docker-compose.yml
```yaml
version: '3.1'
services:
  deviceService:
    container_name: device_service
    image: 'benjr70/smart-smoker-device-service:latest'
    # ... rest of config

  frontend:
    container_name: frontend_smoker
    image: benjr70/smart-smoker-smoker:latest
    # ... rest of config

  electronShell:
    container_name: electron_shell
    image: 'benjr70/smart-smoker-electron-shell:latest'
    # ... rest of config

  watchtower:
    container_name: watchtower
    image: containrrr/watchtower:armhf-latest
    command: --interval 300 --cleanup
    # optional (scope updates to labeled containers only):
    # command: --interval 300 --cleanup --label-enable
    # ... unchanged
```

## Implementation Steps

### Step 1: Update GitHub Actions Workflow (Week 1)
1. **Backup Current Workflow**
   ```bash
   git checkout -b feature/container-naming-update
   cp .github/workflows/publish.yml .github/workflows/publish.yml.backup
   ```

2. **Update publish.yml**
   - Modify tags section to use new naming convention
   - Test with a single service first (backend)
   - Verify both tags are published correctly

3. **Test Publishing**
   ```bash
   # Trigger manual workflow run
   # Verify tags in Docker Hub:
   # - benjr70/smart-smoker-backend:latest
   # - benjr70/smart-smoker-backend:v1.2.3
   ```

### Step 2: Update Docker Compose Files (Week 1)
1. **Update cloud.docker-compose.yml**
   - Change image names to new convention
   - Use `${VERSION:-latest}` for flexibility
   - Dev: set `VERSION=nightly` for dev deploys
   - Prod: set `VERSION=vX.Y.Z` for pinned releases

2. **Update smoker.docker-compose.yml**
   - Change all image names to `:latest` tags (smoker auto-updates)
   - Add Watchtower `--cleanup` to reclaim space
   - Test on development Pi if available

### Step 3: Gradual Migration (Week 1-2)
1. **Dual Publishing Period**
   - Publish to both old and new naming temporarily
   - Begin pushing `nightly` on master merges for dev
   - Monitor Pi for successful Watchtower updates (triggered by `latest`)
   - Verify cloud deployments work with `VERSION=nightly` (dev) and `VERSION=vX.Y.Z` (prod)

2. **Validation Phase**
   ```bash
   # Test Watchtower update cycle
   docker pull benjr70/smart-smoker-device-service:latest
   # Should trigger container restart
   
   # Test manual version deployment
   VERSION=v1.2.3 docker-compose -f cloud.docker-compose.yml up -d

   # Test dev deployment using nightly
    VERSION=nightly docker-compose -f cloud.docker-compose.yml pull
    VERSION=nightly docker-compose -f cloud.docker-compose.yml up -d --force-recreate
   
   # Verify release promotion points to same digest
   docker buildx imagetools inspect benjr70/smart-smoker-backend:nightly | grep Digest
   docker buildx imagetools inspect benjr70/smart-smoker-backend:v1.2.3 | grep Digest
   docker buildx imagetools inspect benjr70/smart-smoker-backend:latest | grep Digest
   # Expect: v1.2.3 and latest have the same digest for a release
  ```

### Step 4: Documentation Updates (Week 2)
1. **Update README files**
2. **Update deployment documentation**
3. **Create rollback procedures**
4. **Update CI/CD documentation**

## Testing Strategy

### Unit Testing
- **Workflow Validation**: Test GitHub Actions changes in feature branch
- **Local Testing**: Validate docker-compose files locally
- **Image Verification**: Confirm tags published correctly to Docker Hub

### Integration Testing
- **Watchtower Testing**: Deploy to test Pi and verify auto-updates
- **Cloud Deployment**: Test manual versioned deployments
- **Dev Nightly Flow**: Verify dev environment consumes `nightly` after master merges
- **Rollback Testing**: Verify ability to rollback to previous versions
- **Digest Consistency**: Verify a release’s `:vX.Y.Z` and `:latest` reference the same manifest digest

### End-to-End Testing
- **Full Pipeline**: Test entire publish → deploy → update cycle
- **Cross-Platform**: Verify ARM and x86 images work correctly
- **Network Connectivity**: Ensure Tailscale connectivity maintained

## Risk Assessment

### High Priority Risks
| Risk | Impact | Mitigation |
|------|--------|------------|
| Watchtower stops working | High | Test on development Pi first, maintain rollback plan |
| Production deployment failure | High | Gradual migration, dual publishing period |
| Container registry rate limits | Medium | Use Docker Hub Pro account, implement cleanup |

### Rollback Plan
1. **Immediate Rollback**: Revert docker-compose files to old naming
2. **Workflow Rollback**: Restore previous publish.yml from backup
3. **Manual Override**: Direct deployment of old container versions
4. **Communication**: Notify team of rollback and reasons

## Dependencies

### External Dependencies
- Docker Hub account with sufficient storage and bandwidth
- Access to Raspberry Pi for Watchtower testing
- GitHub repository admin access for workflow changes

### Internal Dependencies
- All team members aware of new naming convention
- Updated documentation before Phase 2 begins
- Successful validation before proceeding to infrastructure setup

## Success Metrics

### Quantitative Metrics
- **100%** of services using new naming convention
- **< 5 minutes** for Watchtower to detect and update containers
- **Zero** failed deployments due to naming issues
- **100%** of versioned tags successfully published
 - **100%** of master merges publish `nightly` images consumed by dev
- **100%** of releases have `:vX.Y.Z` and `:latest` pointing to the same digest

### Qualitative Metrics
- Team confidence in new naming system
- Simplified deployment procedures
- Improved debugging with clear service separation
- Enhanced development workflow efficiency

## Deliverables

### Phase 1 Outputs
- [ ] Updated `.github/workflows/publish.yml`
- [ ] Modified `cloud.docker-compose.yml`
- [ ] Modified `smoker.docker-compose.yml`
- [ ] Nightly publish workflow defined and documented
- [ ] Updated documentation and README files
- [ ] Tested and validated Watchtower functionality
- [ ] Rollback procedures documented
- [ ] Team training completed

### Handoff to Phase 2
- All containers using standardized naming
- Watchtower successfully updating Pi containers
- Cloud deployments working with new naming
- Documentation updated and team trained
- Terraform can reference consistent image names

## Next Phase Preparation

### Prerequisites for Phase 2
- [ ] All containers successfully using new naming
- [ ] Watchtower auto-updates verified working
- [ ] Production deployments tested and validated
- [ ] Team trained on new procedures
- [ ] Documentation complete and reviewed

---

**Phase Owner**: Development Team  
**Status**: Ready for Implementation  
**Dependencies**: None (foundational phase)  
**Risk Level**: Medium
