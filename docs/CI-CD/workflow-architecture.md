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

#### 5. `release.yml` - Production Deployment
- **Purpose**: Complete release pipeline for production
- **Process**:
  1. Build smoker apps (calls `build.yml` with mode="build-and-export")
  2. Build cloud apps (calls `build.yml` with mode="build-and-export") 
  3. Publish all Docker images (calls `publish.yml`)
  4. Deploy to smoker devices (conditional)
  5. Deploy to cloud infrastructure (conditional)

### Deployment Workflows

#### 6. `smoker-deploy.yml` - Smoker Deployment
- **Purpose**: Deploys to smoker devices
- **Unchanged**: Existing deployment logic

#### 7. `cloud-deploy.yml` - Cloud Deployment  
- **Purpose**: Deploys to cloud infrastructure
- **Unchanged**: Existing deployment logic

#### 8. `docs.yml` - Documentation
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
# release.yml calls:
build.yml (smoker apps, mode: "build-and-export") → Creates artifacts
build.yml (cloud apps, mode: "build-and-export") → Creates artifacts
publish.yml → Pushes all Docker images
smoker-deploy.yml → Deploys to devices (conditional)
cloud-deploy.yml → Deploys to cloud (conditional)
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
├── release.yml              # Production release pipeline
├── 
├── # Deployment Workflows
├── smoker-deploy.yml        # Smoker device deployment
├── cloud-deploy.yml         # Cloud infrastructure deployment
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
