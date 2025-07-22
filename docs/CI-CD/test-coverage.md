# Test Coverage Reports

This guide explains how to generate, view, and interpret test coverage reports for the Smart Smoker V2 project.

## Overview

Test coverage measures how much of your code is executed when your test suite runs. It helps identify:
- Untested code paths
- Areas that need more comprehensive testing
- Code quality metrics for CI/CD pipelines

## Coverage Goals

- **Minimum**: 70% code coverage across all applications
- **Target**: 80%+ code coverage
- **Critical Components**: State management, WebSocket communication, and hardware interfaces should have >90% coverage

## Generating Coverage Reports

### Backend Service
```bash
cd apps/backend
npm run test:cov
```

### Device Service  
```bash
cd apps/device-service
npm run test:cov
```

### Frontend (React)
```bash
cd apps/frontend
npm test -- --coverage --watchAll=false
```

### Smoker App (Electron)
```bash
cd apps/smoker
npm test -- --coverage --watchAll=false
```

### TemperatureChart Package
```bash
cd packages/TemperatureChart
npm run test:coverage
```

## Viewing Coverage Reports

### Terminal Output
When you run coverage tests, you'll see a table like this:

```
---------------|---------|----------|---------|---------|-------------------
File           | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s 
---------------|---------|----------|---------|---------|-------------------
All files      |   85.32 |    78.45 |   92.11 |   84.67 |                   
 src/          |   88.42 |    82.14 |   95.23 |   87.91 |                   
  service.ts   |   92.15 |    85.71 |  100.00 |   91.43 | 45-48,92          
  controller.ts|   84.62 |    75.00 |   90.00 |   83.33 | 12,34-36          
---------------|---------|----------|---------|---------|-------------------
```

**Metrics Explained:**
- **% Stmts**: Percentage of statements executed
- **% Branch**: Percentage of conditional branches taken
- **% Funcs**: Percentage of functions called
- **% Lines**: Percentage of executable lines covered
- **Uncovered Line #s**: Specific line numbers not covered by tests

### HTML Reports
Coverage generates detailed HTML reports you can view in a browser:

```bash
# After running coverage, open the HTML report
cd apps/backend
# Coverage report is in: coverage/lcov-report/index.html

# Open in browser (Linux)
xdg-open coverage/lcov-report/index.html

# Or use VS Code Live Server extension
code coverage/lcov-report/index.html
```

### Coverage Report Structure
```
coverage/
├── lcov-report/           # Interactive HTML reports
│   ├── index.html        # Main coverage dashboard
│   ├── [file].html       # Individual file reports
│   └── assets/           # CSS, JS, and icons
├── coverage-final.json   # Raw coverage data
├── lcov.info            # LCOV format for CI tools
└── clover.xml           # Clover format for CI tools
```

## HTML Report Features

### Main Dashboard (`index.html`)
- **Overall Statistics**: Project-wide coverage percentages
- **File List**: All files with individual coverage metrics
- **Sortable Columns**: Click headers to sort by different metrics
- **Color Coding**: 
  - 🟢 Green: Good coverage (>80%)
  - 🟡 Yellow: Moderate coverage (60-80%)
  - 🔴 Red: Poor coverage (<60%)

### Individual File Reports
Click any file to see:
- **Line-by-line coverage**: Shows which lines were executed
- **Branch coverage**: Highlights conditional statements
- **Function coverage**: Shows which functions were called
- **Source code view**: Syntax-highlighted code with coverage overlay

### Coverage Indicators
- **Green highlight**: Line was executed
- **Red highlight**: Line was not executed  
- **Yellow highlight**: Branch was partially executed
- **Gray line numbers**: Non-executable lines (comments, declarations)

## CI/CD Integration

### GitHub Actions Coverage
The CI pipeline automatically generates coverage reports for all applications:

```yaml
# Excerpt from .github/workflows/ci-tests.yml
- name: Test with coverage
  run: npm run test:cov
  working-directory: ./apps/${{ matrix.app }}
```

### Viewing CI Coverage
1. Go to your GitHub repository
2. Navigate to **Actions** tab
3. Click on a workflow run
4. Expand the **Test Coverage** section
5. Download artifacts containing coverage reports

### Coverage Artifacts
CI preserves coverage reports as downloadable artifacts for 7 days:
- `backend-coverage`
- `device-service-coverage`  
- `frontend-coverage`
- `smoker-coverage`
- `packages-coverage`

## Coverage Configuration

### Jest Configuration (Backend/Device Service)
```json
{
  "jest": {
    "collectCoverageFrom": [
      "**/*.(t|j)s",
      "!**/*.spec.ts",
      "!**/*.interface.ts",
      "!**/node_modules/**"
    ],
    "coverageDirectory": "../coverage",
    "coverageReporters": ["html", "text", "lcov", "clover"]
  }
}
```

### React Testing Configuration (Frontend/Smoker)
```json
{
  "collectCoverageFrom": [
    "src/**/*.{js,jsx,ts,tsx}",
    "!src/**/*.d.ts",
    "!src/index.tsx",
    "!src/reportWebVitals.ts"
  ]
}
```

### Package Testing Configuration
```json
{
  "collectCoverageFrom": [
    "src/**/*.{ts,tsx}",
    "!src/**/*.d.ts",
    "!src/setupTests.ts",
    "!src/__mocks__/**"
  ]
}
```

## Improving Coverage

### Identifying Gaps
1. **Run coverage report**
2. **Open HTML dashboard**
3. **Sort by lowest coverage** (click % Stmts column)
4. **Click on files** with poor coverage
5. **Review highlighted code** to see untested paths

### Common Untested Areas
- **Error handling**: catch blocks, error callbacks
- **Edge cases**: boundary conditions, null checks
- **Async operations**: promise rejections, timeouts
- **Event handlers**: user interactions, WebSocket events
- **Configuration**: environment-specific code paths

### Writing Tests for Coverage
```typescript
// Example: Testing error handling
describe('UserService', () => {
  it('should handle network errors gracefully', async () => {
    // Mock network failure
    jest.spyOn(axios, 'get').mockRejectedValue(new Error('Network error'));
    
    // Test error path
    await expect(userService.getUser('123')).rejects.toThrow('Network error');
  });
  
  it('should handle invalid user IDs', async () => {
    // Test validation path
    await expect(userService.getUser('')).rejects.toThrow('Invalid user ID');
  });
});
```

## Coverage Best Practices

### 1. Focus on Quality, Not Just Quantity
- 100% coverage doesn't guarantee bug-free code
- Test meaningful scenarios, not just lines
- Prioritize critical business logic

### 2. Test Different Code Paths
```typescript
// Good: Test both success and failure paths
it('should handle valid input', () => { /* test success */ });
it('should handle invalid input', () => { /* test failure */ });
it('should handle network timeout', () => { /* test timeout */ });
```

### 3. Use Coverage to Guide Testing
- Identify untested functions
- Add tests for complex logic
- Verify error handling

### 4. Regular Coverage Monitoring
- Check coverage in code reviews
- Set up coverage thresholds in CI
- Track coverage trends over time

## Troubleshooting Coverage Issues

### Low Coverage Due to Generated Code
```json
{
  "collectCoverageFrom": [
    "src/**/*.{ts,tsx}",
    "!src/**/*.generated.ts",
    "!src/migrations/**",
    "!src/**/*.interface.ts"
  ]
}
```

### TypeScript Declaration Files
Exclude `.d.ts` files as they're not executable:
```json
{
  "collectCoverageFrom": [
    "src/**/*.{ts,tsx}",
    "!src/**/*.d.ts"
  ]
}
```

### Node Modules Inclusion
Ensure `node_modules` are excluded:
```json
{
  "coveragePathIgnorePatterns": [
    "/node_modules/",
    "/coverage/"
  ]
}
```

## Coverage Thresholds

### Setting Minimum Thresholds
```json
{
  "jest": {
    "coverageThreshold": {
      "global": {
        "branches": 70,
        "functions": 70,
        "lines": 70,
        "statements": 70
      }
    }
  }
}
```

### Per-Directory Thresholds
```json
{
  "coverageThreshold": {
    "global": {
      "statements": 80
    },
    "./src/critical/": {
      "statements": 95
    }
  }
}
```

## Advanced Coverage Analysis

### Branch Coverage Deep Dive
```typescript
// This function has 4 possible branches
function processUser(user: User | null, isAdmin: boolean) {
  if (!user) return null;           // Branch 1: user is null
  if (isAdmin) {                    // Branch 2: isAdmin is true
    return user.adminData;          // Branch 3: admin path
  }
  return user.userData;             // Branch 4: user path
}

// Tests needed for 100% branch coverage:
// 1. processUser(null, false)     -> Branch 1
// 2. processUser(user, true)      -> Branch 2 + 3  
// 3. processUser(user, false)     -> Branch 4
```

### Function Coverage
- Ensure every function is called at least once
- Constructor functions need instantiation tests
- Arrow functions need execution tests

### Statement Coverage
- Every executable line should run
- Variable declarations with complex initializers
- Return statements in all code paths

By following this guide, you'll have comprehensive visibility into your code's test coverage and can make informed decisions about where to focus your testing efforts.
