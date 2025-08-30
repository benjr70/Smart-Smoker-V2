---
applyTo: '**'
---

# Smart Smoker V2 - Build, Install & Testing Instructions

## Critical Prerequisites

### Environment Setup

- **Node.js**: 24 (managed via mise)
- **npm**: 10 (managed via mise)
- **Python**: 3.11 (for documentation)

### Dependency Installation Rules

**ALWAYS use `--legacy-peer-deps` flag when installing dependencies to resolve
version conflicts.**

## Bootstrap Process (REQUIRED FIRST)

```bash
# From repository root - MUST run this before any other commands
npm run bootstrap
```

This command runs `npm install --legacy-peer-deps` across the entire workspace.

## Individual App Installation (if needed)

```bash
# Only run these if you need to install dependencies for specific apps
cd apps/backend && npm install --legacy-peer-deps
cd apps/device-service && npm install --legacy-peer-deps
cd apps/frontend && npm install --legacy-peer-deps
cd apps/smoker && npm install --legacy-peer-deps
cd packages/TemperatureChart && npm install --legacy-peer-deps
```

## Development Commands

### Starting Services (from repository root)

```bash
# Start all services in parallel
npm start

# Individual services
npm run back:start         # Backend API server (NestJS dev mode)
npm run front:start        # React frontend with webpack dev server
npm run smoker:start       # Electron app in development mode
npm run devices:start      # Device service in NestJS dev mode
```

### Build Commands

```bash
# Build all applications
npm run build              # If available at root level

# Individual app builds (run from app directories)
cd apps/backend && npm run build      # NestJS compilation
cd apps/frontend && npm run build     # Webpack production build
cd apps/smoker && npm run build       # Electron packaging
cd apps/device-service && npm run build # NestJS compilation
```

## Testing Requirements

### Critical Testing Rules

1. **Tests MUST be run from within each app directory, NOT from root**
2. **All tests must pass for CI/CD to succeed**
3. **Coverage thresholds are enforced and vary by application**

### Backend Tests (80% coverage threshold)

```bash
cd apps/backend
npm test                   # Unit tests
npm run test:cov          # Unit tests with coverage report
npm run test:e2e          # End-to-end tests
```

### Device Service Tests (75% coverage threshold)

```bash
cd apps/device-service
npm test                   # Unit tests
npm run test:cov          # Unit tests with coverage
npm run test:e2e          # End-to-end tests
```

### Frontend Tests (75% coverage threshold)

```bash
cd apps/frontend
npm test                   # React component tests
```

### Smoker App Tests (80% coverage threshold)

```bash
cd apps/smoker
npm test                   # Electron app tests
```

### Package Tests

```bash
cd packages/TemperatureChart
npm test                   # Tests require Jest configuration to support D3.js ES modules
```

## Coverage Thresholds (Enforced by CI)

- **Backend**: 80% (lines, functions, branches, statements)
- **Device Service**: 75% (lines, functions, branches, statements)
- **Frontend**: 75% lines/functions/statements, 70% branches
- **Smoker**: 80% lines/functions/statements, 75% branches
- **TemperatureChart**: 75% lines/branches/statements, 45% functions

## Documentation Commands

```bash
# From repository root
mise run docs-install      # Install MkDocs dependencies
mise run docs-serve        # Serve docs locally at http://127.0.0.1:8001
mise run docs-build        # Build static documentation site
mise run docs-deploy       # Deploy to GitHub Pages
```

## Common Build Issues & Solutions

### 1. Dependency Conflicts

**Problem**: npm install fails with peer dependency warnings **Solution**:
Always use `--legacy-peer-deps` flag

### 2. "Cannot find module" Errors

**Problem**: Missing dependencies when running apps **Solution**: Run
`npm run bootstrap` from repository root first

### 3. Test Coverage Failures

**Problem**: CI fails due to coverage below thresholds **Solution**: Check
specific app thresholds above, add more tests

### 4. Jest ES Module Issues (TemperatureChart)

**Problem**: D3.js ES module import errors in tests **Solution**: Package uses a
special Jest configuration to support ES modules

### 5. TypeScript Compilation Errors

**Problem**: Build fails with TS errors **Solution**: All apps use TypeScript
strict mode - fix type errors

### 6. Serial Port Access Errors (Device Service)

**Problem**: Tests fail when trying to access hardware **Solution**: Mock
hardware interfaces in test environment

### 7. Test Timeout Errors

**Problem**: Hardware-related tests timeout **Solution**: Some tests may need
longer timeouts for hardware operations

### 8. WebSocket Connection Issues

**Problem**: Real-time features fail in development **Solution**: Ensure proper
authentication headers and connection handling

## CI/CD Pipeline Validation

**GitHub Actions runs automatically on all pull requests:**

- Jest tests for all 4 applications + TemperatureChart package
- TypeScript compilation checks for all apps
- Build verification for frontend applications
- Coverage threshold validation (see thresholds above)
- Code quality and linting checks

**Branch Protection**: Master branch requires ALL CI checks to pass before
merging.

## Environment Cleanup

```bash
# Clean all node_modules and package-lock files
npm run clean

# Clean and reinstall everything
npm run clean:install
```

## Troubleshooting Workflow

1. **If any command fails**: Run `npm run bootstrap` first
2. **If tests fail**: Check you're in the correct app directory
3. **If coverage fails**: Review specific thresholds for that app
4. **If builds fail**: Check TypeScript errors and dependency issues
5. **If CI fails**: Run the exact same commands locally that CI runs
