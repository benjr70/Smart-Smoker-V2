---
applyTo: "**"
---

# Smart Smoker V2 - Git Workflow & Branch Management

## Branch Naming Conventions (ENFORCED)

### Branch Types & Naming Patterns

#### Feature Branches
```
feature/[scope]/[description]
```
**Examples:**
- `feature/backend/add-temperature-alerts`
- `feature/frontend/smoking-profile-ui`
- `feature/device/serial-communication-improvements`
- `feature/docs/api-documentation-update`

#### Bug Fix Branches
```
bugfix/[scope]/[description]
fix/[scope]/[description]
```
**Examples:**
- `bugfix/backend/websocket-connection-leak`
- `fix/frontend/temperature-chart-rendering`
- `bugfix/device-service/sensor-timeout-handling`

#### Hotfix Branches (Production Issues)
```
hotfix/[version]/[critical-issue]
```
**Examples:**
- `hotfix/v2.1.1/critical-temperature-reading-failure`
- `hotfix/v2.1.0/database-connection-timeout`

#### Release Branches
```
release/[version]
```
**Examples:**
- `release/v2.1.0`
- `release/v2.2.0-beta`

#### Chore/Maintenance Branches
```
chore/[scope]/[description]
```
**Examples:**
- `chore/deps/update-nestjs-dependencies`
- `chore/ci/improve-test-coverage-reporting`
- `chore/infra/docker-configuration-updates`

### Scope Guidelines

**Valid Scopes:**
- `backend` - Backend service changes
- `frontend` - React web application changes
- `device-service` - Device communication service
- `smoker` - Electron desktop application
- `hardware` - Arduino/MicroController changes
- `packages` - Shared package changes
- `docs` - Documentation updates
- `ci` - CI/CD pipeline changes
- `infra` - Infrastructure and deployment
- `deps` - Dependency updates
- `config` - Configuration changes

### Branch Naming Rules

1. **Use lowercase with hyphens** (kebab-case)
2. **Maximum 50 characters** for the entire branch name
3. **Be descriptive but concise** - avoid abbreviations
4. **Include scope** to indicate which part of the system is affected
5. **Use present tense verbs** (add, fix, update, remove)
6. **Avoid special characters** except hyphens and forward slashes

## Pull Request Requirements (MANDATORY)

### PR Title Format
```
[scope]: Brief description of changes

Examples:
- backend: Add temperature alert notification system
- frontend: Implement smoking profile management UI
- device-service: Fix serial port timeout handling
- docs: Update API documentation for temperature endpoints
```

### PR Description Template (REQUIRED)

```markdown
## Description
Brief summary of changes and motivation for the change.

## Type of Change
- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update
- [ ] Performance improvement
- [ ] Refactoring (no functional changes)
- [ ] CI/CD changes

## Affected Applications
- [ ] Backend Service (apps/backend)
- [ ] Device Service (apps/device-service)
- [ ] Frontend (apps/frontend)
- [ ] Smoker App (apps/smoker)
- [ ] MicroController (Arduino firmware)
- [ ] Shared Packages (packages/*)
- [ ] Documentation (docs/)
- [ ] CI/CD Pipeline (.github/workflows)

## Testing Checklist
- [ ] Unit tests pass locally (`npm test` from app directory)
- [ ] E2E tests pass locally (`npm run test:e2e` from app directory)
- [ ] Coverage thresholds met (see app-specific requirements)
- [ ] Manual testing completed for affected functionality
- [ ] Hardware integration tested (if applicable)

## Code Quality Checklist
- [ ] TypeScript strict mode compliance
- [ ] ESLint/Prettier formatting applied
- [ ] No console.log statements in production code
- [ ] Proper error handling implemented
- [ ] API documentation updated (if applicable)
- [ ] Environment variables documented (if new ones added)

## Security Checklist (if applicable)
- [ ] Input validation implemented
- [ ] Authentication/authorization considered
- [ ] No sensitive data exposed in logs
- [ ] Dependencies scanned for vulnerabilities

## Breaking Changes
If this is a breaking change, describe what changes users need to make:
- Configuration changes required
- API changes that affect other applications
- Database migration requirements
- Hardware compatibility changes

## Additional Notes
Any additional context, screenshots, or relevant information.
```

### Pre-Merge Requirements (ENFORCED BY CI)

#### Automated Checks (ALL MUST PASS)
1. **Build Verification**: All affected applications must build successfully
2. **Test Coverage**: Meet minimum coverage thresholds per application:
   - Backend: 80% (lines, functions, branches, statements)
   - Device Service: 75% (lines, functions, branches, statements)
   - Frontend: 75% lines/functions/statements, 70% branches
   - Smoker: 80% lines/functions/statements, 75% branches
   - TemperatureChart: 75% lines/branches/statements, 45% functions
3. **TypeScript Compilation**: No TypeScript errors in strict mode
4. **Linting**: ESLint and Prettier checks pass
5. **Dependencies**: No security vulnerabilities in new dependencies

#### Manual Review Requirements
1. **Code Review**: At least one approved review from a team member
2. **Architecture Review**: For significant changes affecting multiple applications
3. **Security Review**: For changes involving authentication, authorization, or sensitive data
4. **Performance Review**: For changes affecting real-time communication or hardware interaction

## Workflow Patterns

### Standard Feature Development Flow

1. **Create Feature Branch**
   ```bash
   git checkout master
   git pull origin master
   git checkout -b feature/backend/add-temperature-alerts
   ```

2. **Development & Testing**
   ```bash
   # Make changes and commit frequently
   git add .
   git commit -m "backend: Add temperature alert service"
   
   # Run tests locally before pushing
   cd apps/backend
   npm test
   npm run test:cov
   ```

3. **Push and Create PR**
   ```bash
   git push origin feature/backend/add-temperature-alerts
   # Create PR through GitHub UI with proper template
   ```

4. **Code Review & CI Pipeline**
   - Address review feedback
   - Ensure all CI checks pass
   - Update documentation if needed

5. **Merge and Cleanup**
   ```bash
   # After PR approval and CI success
   git checkout master
   git pull origin master
   git branch -d feature/backend/add-temperature-alerts
   ```

### Hotfix Flow (Critical Production Issues)

1. **Create Hotfix Branch from Master**
   ```bash
   git checkout master
   git pull origin master
   git checkout -b hotfix/v2.1.1/critical-temperature-reading-failure
   ```

2. **Implement Fix with Minimal Changes**
   - Keep changes as small as possible
   - Focus only on the critical issue
   - Add tests for the specific issue

3. **Fast-Track Review Process**
   - Expedited code review
   - Run full test suite
   - Deploy to staging for verification

4. **Merge and Tag Release**
   ```bash
   # After approval and testing
   git checkout master
   git merge hotfix/v2.1.1/critical-temperature-reading-failure
   git tag v2.1.1
   git push origin master --tags
   ```

## Commit Message Standards

### Commit Message Format
```
[scope]: Brief description (max 50 chars)

Optional longer description explaining the why and what
of the change. Wrap at 72 characters.

- Can include bullet points
- Reference issues: Fixes #123
- Breaking changes: BREAKING CHANGE: description
```

### Commit Message Types
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, missing semicolons, etc.)
- `refactor`: Code refactoring without functional changes
- `test`: Adding or updating tests
- `chore`: Maintenance tasks, dependency updates
- `perf`: Performance improvements
- `ci`: CI/CD changes

### Examples
```
backend: Add temperature alert notification system

Implement real-time temperature monitoring with configurable
thresholds and WebSocket notifications to frontend clients.

- Add TemperatureAlert service with threshold management
- Integrate with existing temperature monitoring pipeline  
- Add WebSocket events for real-time alert broadcasting
- Include unit tests with 85% coverage

Fixes #234
```

## Branch Protection Rules

### Master Branch Protection (ENFORCED)
- **Require pull request reviews**: At least 1 approval required
- **Dismiss stale reviews**: When new commits are pushed
- **Require status checks**: All CI tests must pass
- **Require up-to-date branches**: Must be current with master
- **Include administrators**: Rules apply to all users
- **Allow force pushes**: Disabled
- **Allow deletions**: Disabled

### Release Branch Protection
- Same rules as master branch
- Additional requirement for release manager approval
- Deployment pipeline integration required

## Git Hooks & Automation

### Pre-commit Hooks (Recommended Setup)
```bash
# Install pre-commit hooks to enforce standards
npm install -g husky lint-staged

# Add to package.json
{
  "husky": {
    "hooks": {
      "pre-commit": "lint-staged",
      "commit-msg": "commitlint -E HUSKY_GIT_PARAMS"
    }
  },
  "lint-staged": {
    "*.{ts,tsx,js,jsx}": ["eslint --fix", "prettier --write"],
    "*.{md,json}": ["prettier --write"]
  }
}
```

### Automated Branch Cleanup
- Stale branches (30+ days inactive) flagged for review
- Feature branches automatically deleted after successful merge
- Release branches preserved for version history

## Common Workflow Issues & Solutions

### 1. Branch Name Validation Errors
**Problem**: CI rejects branch names not following conventions
**Solution**: Rename branch locally and force push
```bash
git branch -m old-branch-name feature/backend/new-correct-name
git push origin -u feature/backend/new-correct-name
git push origin --delete old-branch-name
```

### 2. Failed CI Checks
**Problem**: Tests fail in CI but pass locally
**Solution**: Ensure local environment matches CI
```bash
# Run exact CI commands locally
npm run bootstrap
cd apps/backend && npm test && npm run test:e2e
```

### 3. Merge Conflicts
**Problem**: Branch conflicts with master during PR
**Solution**: Rebase on latest master
```bash
git checkout master
git pull origin master
git checkout feature/my-branch
git rebase master
# Resolve conflicts, then force push
git push origin feature/my-branch --force-with-lease
```

### 4. Large PR Review Delays
**Problem**: PRs too large for effective review
**Solution**: Break into smaller, focused PRs
- Each PR should address a single concern
- Maximum ~400 lines of code changes
- Use draft PRs for work-in-progress sharing

### 5. Missing Test Coverage
**Problem**: PR fails coverage thresholds
**Solution**: Add targeted tests before merging
- Focus on uncovered lines in coverage reports
- Add integration tests for new features
- Mock external dependencies properly

## Release Management

### Version Tagging Strategy
- **Semantic Versioning**: MAJOR.MINOR.PATCH
- **Pre-release**: v2.1.0-beta.1, v2.1.0-rc.1
- **Hotfix**: v2.1.1, v2.1.2

### Release Branch Management
1. Create release branch from master
2. Version bump and changelog updates
3. Final testing and bug fixes
4. Merge to master with version tag
5. Deploy to production
6. Merge back to development branches if needed

This Git workflow ensures code quality, proper review processes, and maintainable version history while supporting the complex multi-application architecture of Smart Smoker V2.
