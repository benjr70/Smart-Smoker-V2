# Dependency Management Guide

This guide covers how to properly manage dependencies across the Smart Smoker V2 monorepo.

## Clean Installation Process

When you encounter dependency conflicts or need to ensure a fresh installation:

### 1. Clean All Dependencies
```bash
npm run clean
```

This command removes:
- All `node_modules` folders from root, apps, and packages
- All `package-lock.json` files from root, apps, and packages

### 2. Fresh Bootstrap Installation
```bash
npm run bootstrap
```

This installs all dependencies using workspace configuration with `--legacy-peer-deps` flag.

### 3. One-Step Clean & Install
```bash
npm run clean:install
```

Combines both steps above for convenience.

## When to Use Clean Installation

### Required Scenarios
- **After major dependency updates**
- **When CI/CD builds fail due to dependency conflicts**
- **When switching between Node.js versions**
- **Before creating PRs with dependency changes**

### Recommended Scenarios
- **Weekly maintenance** (clean slate)
- **After pulling major changes** from other developers
- **When experiencing unusual build errors**

## Workspace Commands

The project uses npm workspaces for monorepo management:

### Individual App Installation
```bash
# Install only backend dependencies
npm install --workspace=backend --legacy-peer-deps

# Install only frontend dependencies  
npm install --workspace=frontend --legacy-peer-deps

# Install only smoker dependencies
npm install --workspace=smoker --legacy-peer-deps

# Install only device-service dependencies
npm install --workspace=device-service --legacy-peer-deps
```

### Individual Package Installation
```bash
# Install only TemperatureChart dependencies
npm install --workspace=temperaturechart --legacy-peer-deps
```

## CI/CD Considerations

### GitHub Actions Requirements
Our CI pipeline expects:
- ✅ **Committed package-lock.json files** in each app/package
- ✅ **Compatible dependency versions** across workspaces
- ✅ **Jest 28.0.3** alignment for consistent testing

### Before Pushing Changes
Always run after dependency modifications:
```bash
npm run clean:install
git add apps/*/package-lock.json packages/*/package-lock.json package-lock.json
git commit -m "chore: update package-lock.json files after dependency changes"
```

## Troubleshooting Common Issues

### Issue: "Cannot find module" errors
**Solution**: 
```bash
npm run clean:install
```

### Issue: "Peer dependency warnings"
**Cause**: Version mismatches between workspaces
**Solution**: 
1. Check if versions align in package.json files
2. Run `npm run clean:install`
3. Use `--legacy-peer-deps` flag as configured

### Issue: CI fails but local works
**Cause**: Missing or outdated package-lock.json files
**Solution**:
```bash
npm run clean:install
git add . && git commit -m "fix: update package-lock.json files for CI"
```

### Issue: "ERESOLVE unable to resolve dependency tree"
**Cause**: Conflicting dependency versions
**Solution**:
1. Review package.json files for version conflicts
2. Align major versions (especially React, TypeScript, Jest)
3. Run `npm run clean:install`

## Dependency Version Strategy

### Core Dependencies (Must Match)
- **Jest**: 28.0.3 across all apps
- **TypeScript**: ^4.7.4 for consistency
- **React**: ^18.2.0 for frontend apps

### Build Dependencies
- **Webpack**: 5.x for modern builds
- **Babel**: 7.x for transpilation
- **CSS Loaders**: Compatible versions

### Testing Dependencies
- **@testing-library/react**: ^13.4.0 for React 18
- **@testing-library/jest-dom**: ^5.16.4
- **identity-obj-proxy**: ^3.0.0 for CSS mocking

## Best Practices

### 1. Regular Maintenance
```bash
# Weekly cleanup
npm run clean:install
```

### 2. Before Major Changes
```bash
# Clean before dependency updates
npm run clean
# Make changes to package.json files
npm run bootstrap
```

### 3. After Pulling Changes
```bash
# Ensure fresh state
npm run clean:install
```

### 4. Before Committing
```bash
# Test all apps work
npm run clean:install
cd apps/backend && npm test
cd ../device-service && npm test  
cd ../frontend && npm test
cd ../smoker && npm test
cd ../../packages/TemperatureChart && npm test
```

## Scripts Reference

| Script | Purpose | Usage |
|--------|---------|-------|
| `npm run clean` | Remove all node_modules and package-lock.json | Cleanup only |
| `npm run bootstrap` | Install all dependencies with workspaces | Fresh install |
| `npm run clean:install` | Clean + Bootstrap in one command | Full reset |
| `npm start` | Start all services in parallel | Development |
| `npm run front:start` | Start only frontend | Frontend dev |
| `npm run back:start` | Start only backend | Backend dev |
| `npm run smoker:start` | Start only smoker app | Smoker dev |
| `npm run devices:start` | Start only device service | Device dev |

## Emergency Recovery

If you encounter severe dependency issues:

```bash
# Nuclear option - complete reset
rm -rf node_modules
rm -rf apps/*/node_modules  
rm -rf packages/*/node_modules
rm package-lock.json
rm apps/*/package-lock.json
rm packages/*/package-lock.json

# Fresh start
npm run bootstrap

# Verify all apps
npm test --workspace=backend
npm test --workspace=device-service  
npm test --workspace=frontend
npm test --workspace=smoker
npm test --workspace=temperaturechart
```

Following this guide ensures consistent, reliable dependency management across the entire Smart Smoker V2 project.
