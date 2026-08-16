# GitHub Actions CI/CD

This directory contains GitHub Actions workflows for the Smart Smoker V2 project.

## Workflows

### `ci-tests.yml` - Continuous Integration Testing
**Triggers**: Pull Requests to `master` branch  
**Purpose**: Runs comprehensive testing suite on all PRs

**What it tests:**
- ✅ Jest unit tests for all 4 applications (backend, device-service, frontend, smoker)
- ✅ Package tests (TemperatureChart and future packages)
- ✅ TypeScript compilation verification
- ✅ Build verification for frontend applications
- ✅ Code quality and linting

**Jobs:**
- `test`: Parallel testing of all applications using matrix strategy
- `test-packages`: Tests shared packages
- `lint-check`: TypeScript compilation verification
- `build-check`: Build verification for React/Electron apps
- `coverage-report`: Aggregates test results and generates summary
- `all-tests-passed`: Final status check (required for merge)

### `pr-title-lint.yml` - Conventional PR Title
**Triggers**: Pull Requests to `master`
**Purpose**: Validates the PR title against Conventional Commits, because the
squashed title is what release-please parses for the version bump and changelog

- Thin wrapper around `scripts/validate-pr-title.sh` — run the same script
  locally before opening a PR
- The title check is **advisory** today (warning annotation, not a red PR); the
  `validator-tests` job that runs `scripts/validate-pr-title.test.sh` is
  blocking
- See [Release Process](release-process.md#2-pr-title-convention)

### Release & Deployment Workflows
- `release-please.yml`: Maintains the always-open release PR and, on merge, tags
  the repo and publishes the GitHub Release. Authenticated with `RUNNER_PAT`
  (not `GITHUB_TOKEN`, whose Releases do not trigger downstream workflows)
- `prod-deploy.yml`: Fires on `release: published`. Builds backend + frontend
  **from the release tag**, deploys prod over SSH with health check and
  rollback, notifies Discord, then runs a blocking smoke gate. Also has a
  `workflow_dispatch` version input as a re-deploy/rollback escape hatch
- `release.yml`: Builds and publishes the smoker/device-service/electron-shell
  images from the tag on `release: published` (manual version input kept as an
  escape hatch). It deliberately has no smoker deploy job — publishing `:latest`
  *is* the device deployment, applied by Watchtower on the device
- `nightly.yml`: Nightly Dev Build & Deploy (publishes `:nightly` for dev-cloud)
- `device-deploy.yml`: Device deployment over SSH (reusable + manual). Targets the virtual
  smoker or the physical Pi; see [Physical Smoker Device](smoker-device.md)

The full picture — what triggers a release PR, what merging it does, and the
token requirements — is in [Release Process](release-process.md).

### Other Workflows
- `install.yml`: Installation and setup workflow
- `build.yml`: Application build validation (reusable)
- `publish.yml`: Docker Hub publishing (reusable)
- `docs.yml`: Documentation deployment
- `release-config-tests.yml`: Runs `scripts/release/release-please-config.test.sh`
  to pin the release-please config choices

## Branch Protection

To enforce CI requirements:
1. See `.github/BRANCH_PROTECTION_SETUP.md` for setup instructions
2. Configure required status checks in GitHub repository settings
3. Require all CI jobs to pass before allowing PR merges

## Development Workflow

1. **Create Feature Branch**: `feature/SS2-XX-description`
2. **Make Changes**: Develop and commit your changes
3. **Create PR**: Open Pull Request to `master` with a conventional title
   (`feat(scope): …`) and `Closes #N` in the body; validate locally with
   `bash scripts/validate-pr-title.sh "<title>"`
4. **CI Runs Automatically**: All tests run on your PR
5. **Review Process**: Address any failing tests + get code review
6. **Merge**: Once CI passes and approved, squash-merge the PR
7. **Release**: when you want it in production, merge the release PR —
   see [Release Process](release-process.md)

## CI Status Checks

The following status checks must pass:
- `Run Jest Tests (backend)`
- `Run Jest Tests (device-service)`
- `Run Jest Tests (frontend)`
- `Run Jest Tests (smoker)`
- `Test Packages`
- `Lint Check`
- `Build Check (frontend)`
- `Build Check (smoker)`
- `All Tests Status`

## Debugging Failed CI

1. **Check Actions Tab**: View detailed logs for failed jobs
2. **Local Testing**: Run the same commands locally:
   ```bash
   cd apps/[app-name]
   npm ci --legacy-peer-deps
   npm test
   ```
3. **TypeScript Issues**: Check compilation:
   ```bash
   cd apps/[app-name]
   npx tsc --noEmit
   ```
4. **Build Issues**: Test builds locally:
   ```bash
   cd apps/frontend  # or apps/smoker
   npm run build
   ```

## Performance

- **Parallel Execution**: Apps tested simultaneously for speed
- **Caching**: Node modules cached between runs
- **Timeouts**: Jobs timeout after 15 minutes to prevent hanging
- **Artifacts**: Test coverage and results preserved for 7 days

## Adding New Applications

When adding new apps to the monorepo:

1. **Update Matrix Strategy** in `ci-tests.yml`:
   ```yaml
   strategy:
     matrix:
       app: [backend, device-service, frontend, smoker, new-app]
       include:
         - app: new-app
           path: apps/new-app
           test-command: npm test
   ```

2. **Update Branch Protection** to include new status checks

3. **Ensure Testing Setup** follows the patterns in `docs/Packages/testing-template.md`

## Documentation Dependencies

MkDocs dependencies are managed through `mise` tasks:
- **MkDocs**: 1.6.1
- **Material Theme**: 9.6.15
- **Installation**: `mise run docs-install` (defined in `mise.toml`)
