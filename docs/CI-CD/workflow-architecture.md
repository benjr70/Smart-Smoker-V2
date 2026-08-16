# GitHub Actions Workflow Architecture

## Overview
The Smart Smoker v2 project uses a clean, reusable workflow architecture that eliminates redundancy and provides clear separation of concerns. Each workflow has a single responsibility and can be composed together as needed.

## Current Workflow Architecture

### Core Reusable Workflows

#### 1. `install.yml` - Dependency Management
- **Purpose**: Sets up Node.js environment and installs all dependencies
- **Features**:
  - Workspace artifact upload for reuse across jobs
  - Dependency caching for faster builds
  - Single source of truth for environment setup
- **Used by**: Called internally by `build.yml`

#### 2. `build.yml` - Application Builder
- **Purpose**: Builds applications and optionally creates Docker images
- **Modes**:
  - `test`: Run Jest tests only
  - `build`: Build applications without Docker export
  - `build-and-export`: Build applications and export Docker images as artifacts
- **Features**:
  - Calls `install.yml` internally for dependencies
  - Matrix strategy for parallel builds
  - Configurable app selection via JSON array
  - Conditional Docker image export

#### 3. `publish.yml` - Docker Hub Publisher
- **Purpose**: Publishes Docker images to Docker Hub
- **Features**:
  - Downloads image artifacts from build jobs
  - Pushes to Docker Hub with version tags
  - Automatic `latest` tagging for release versions
  - Matrix strategy for parallel publishing

### Orchestrator Workflows

#### 4. `ci-tests.yml` - Pull Request Validation
- **Purpose**: Validates code changes on pull requests
- **Process**:
  1. Run tests for all applications (calls `build.yml` with mode="test")
  2. Build validation (calls `build.yml` with mode="build")
- **Benefits**: Fast feedback, parallel execution, no redundant installs

#### 5. `release-please.yml` - Release Cutter
- **Purpose**: Keeps the release PR (version bump + CHANGELOG) up to date on
  every push to `master`, and on merge tags `vX.Y.Z` + publishes the GitHub
  Release
- **Builds nothing itself** — it only produces the `release: published` event
  that the two pipelines below listen for
- **Auth**: `RUNNER_PAT`, not `GITHUB_TOKEN` (see
  [Release Process](release-process.md#5-token-requirements-runner_pat))

#### 6. `release.yml` - Smoker Release Pipeline
- **Purpose**: Builds and publishes the device-side images for a release
- **Process**:
  1. Build smoker apps — smoker, device-service, electron-shell — from the tag
     (calls `build.yml` with mode="build-and-export")
  2. Publish those Docker images with `:latest` + `:vX.Y.Z` (calls `publish.yml`)

  Smoker devices are not deployed to here: publishing `:latest` *is* their
  deployment, applied by Watchtower on the device.

#### 7. `prod-deploy.yml` - Production Pipeline
- **Purpose**: Turns a published Release into a running production cloud
- **Process**:
  1. Resolve + validate the version from the release tag (or dispatch input)
  2. Probe Docker Hub; skip the build when `:vX.Y.Z` already exists
  3. Build backend + frontend **from the release tag** (calls `publish.yml` with
     mode="release", `prebuild: true`) — no `:nightly` promotion
  4. Deploy over SSH from the proxmox runner via `scripts/deploy-cloud.sh`,
     with health check, rollback and Discord notification — the job targets the
     `production` environment, which still gates it on a required-reviewer
     approval + 5-minute wait timer (removal pending)
  5. Blocking post-deploy smoke gate on a GitHub-hosted runner

### Deployment Workflows

#### 8. `device-deploy.yml` - Device Deployment
- **Purpose**: Deploys a compose file to a smoker device (virtual or the physical Pi) over
  SSH, with backup, health check and automatic rollback
- **Note**: Only needed when the compose file changes. Image updates reach devices via
  Watchtower — see [Physical Smoker Device](smoker-device.md)

#### 9. `dev-deploy.yml` / `nightly.yml` - Development Cloud
- **Purpose**: Build and deploy `:nightly` to dev-cloud on master merges
- **Note**: `:nightly` never reaches production or the physical device

#### 10. `docs.yml` - Documentation
- **Purpose**: Builds and deploys documentation
- **Unchanged**: Existing MkDocs deployment

## Benefits of Current Architecture

### 1. **Resource Efficiency**
- Single `npm run bootstrap` per workflow execution (no redundant installs)
- Parallel builds with shared dependencies
- Efficient artifact-based image sharing

### 2. **Maintainability**
- Single source of truth for setup logic (`install.yml`)
- Reusable components with clear responsibilities
- Clean separation of concerns (install → build → publish → deploy)

### 3. **Flexibility**
- Easy to add new applications to build matrix
- Conditional publishing and deployment
- Composable workflows for different scenarios

### 4. **Developer Experience**
- Fast CI feedback through parallelization
- Clear workflow visualization in GitHub Actions
- Easy to debug specific stages independently

## Workflow Composition Examples

### Pull Request Testing
```yaml
# ci-tests.yml calls:
build.yml (mode: "test") → Tests all apps
build.yml (mode: "build") → Validates builds
```

### Production Release
```yaml
# merge of the release PR → release-please.yml tags vX.Y.Z + publishes a Release
#
# release.yml (release: published) calls:
build.yml (smoker apps, mode: "build-and-export") → Creates artifacts
publish.yml → Pushes device images (`:latest` + `:vX.Y.Z`)
# devices: Watchtower picks up `:latest` on its next poll
#
# prod-deploy.yml (release: published) calls:
publish.yml (backend + frontend, mode: "release", ref: vX.Y.Z) → builds from the tag
scripts/deploy-cloud.sh over SSH → deploys prod pinned to vX.Y.Z
scripts/smoke → blocking post-deploy gate
```

## Usage Examples

### Running Tests Only
```yaml
uses: ./.github/workflows/build.yml
with:
  apps: '["backend", "frontend"]'
  mode: "test"
  ref: ${{ github.ref }}
```

### Building and Exporting Docker Images
```yaml
uses: ./.github/workflows/build.yml
with:
  apps: '["smoker", "device-service"]'
  mode: "build-and-export"
  version: "1.0.0"
  ref: "v1.0.0"
```

### Publishing Docker Images
```yaml
uses: ./.github/workflows/publish.yml
with:
  images: '["smoker_image", "backend_image"]'
  version: "1.0.0"
secrets: inherit
```

## Current File Structure

```
.github/workflows/
├── # Core Reusable Workflows
├── install.yml              # Dependency setup & workspace artifacts
├── build.yml                # Application building & Docker image creation
├── publish.yml              # Docker Hub publishing
├── 
├── # Orchestrator Workflows  
├── ci-tests.yml             # PR validation & testing
├── pr-title-lint.yml        # Conventional PR title (release-please input)
├── release-please.yml       # Release PR → tag + GitHub Release
├── release.yml              # Smoker image release pipeline
├── 
├── # Deployment Workflows
├── prod-deploy.yml          # Production cloud: build from tag, deploy, smoke
├── dev-deploy.yml           # Dev cloud deployment (`:nightly`)
├── device-deploy.yml        # Smoker device deployment (compose changes only)
└── docs.yml                 # Documentation deployment
```

## Architecture Principles

1. **Single Responsibility**: Each workflow does one thing well
2. **Composable**: Workflows can be combined for different scenarios  
3. **Reusable**: No duplicate logic across workflows
4. **Testable**: Each component can be tested independently
5. **Maintainable**: Clear ownership and minimal interdependencies

## Adding New Applications

To add a new application to the build pipeline:

1. **Add to build matrix**: Include app name in the `apps` JSON array
2. **Update build.yml**: Add build commands for the new app if needed
3. **Update Dockerfiles**: Ensure proper Dockerfile exists
4. **Test locally**: Run the workflow with the new app included

No changes needed to core workflow logic - the architecture is designed to scale.
