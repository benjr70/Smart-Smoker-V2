# Pre-commit Checks

You are tasked with running all the tests and checks that are executed in the PR
CI workflow to ensure code is ready to push. Follow these steps carefully:

## Prerequisites Check

1. **Check Node.js and npm**:
   - Run `node --version` and `npm --version`
   - If not installed, inform the user they need to install Node.js and npm
     first

2. **Check if dependencies are installed**:
   - Check if `node_modules` directory exists in the root
   - If not, ask the user: "Dependencies not found. Should I run 'npm install'
     now?"
   - If user confirms, run `npm install --legacy-peer-deps` (or
     `npm run bootstrap`)
   - Wait for installation to complete before proceeding

3. **Verify we're in the project root**:
   - Ensure `package.json` exists
   - Ensure `apps/` and `packages/` directories exist

## Step 1: Run Code Quality Checks

Run these checks first as they are quick and can catch issues early:

### 1.1 Formatting Check

1. Run: `npm run format:check`
2. Check the exit code:
   - If exit code is 0: Formatting is correct
   - If exit code is non-zero: Files are not properly formatted
     - Inform the user: "Some files are not properly formatted. Run 'npm run
       format' to fix them."
     - Ask if they want to auto-fix: "Would you like me to run 'npm run format'
       to fix formatting issues?"
     - If yes, run `npm run format` and then re-run `npm run format:check` to
       verify

### 1.2 Linting Check

1. Run: `npm run lint:apps`
2. Check the exit code:
   - If exit code is 0: Linting passed
   - If exit code is non-zero: Linting errors found
     - Show the linting errors to the user
     - Inform the user: "Linting errors found. Run 'npm run lint:apps:fix' to
       auto-fix some issues."
     - Ask if they want to auto-fix: "Would you like me to run 'npm run
       lint:apps:fix' to fix linting issues?"
     - If yes, run `npm run lint:apps:fix` and then re-run `npm run lint:apps`
       to verify

**Note**: Continue to next steps even if code quality checks fail, but make sure
to report all failures in the summary.

## Step 2: Run Tests with Coverage

Run tests for all applications. These tests will fail if coverage thresholds are
not met.

### 2.1 Test Backend

1. Run: `npm run test:cov --prefix apps/backend`
2. Check exit code:
   - Exit code 0: Tests passed and coverage thresholds met (80% required)
   - Non-zero: Tests failed or coverage below threshold
3. Record the result

### 2.2 Test Device Service

1. Run: `npm run test:cov --prefix apps/device-service`
2. Check exit code:
   - Exit code 0: Tests passed and coverage thresholds met (75% required)
   - Non-zero: Tests failed or coverage below threshold
3. Record the result

### 2.3 Test Frontend

1. Run:
   `cd apps/frontend && CI=true npm test -- --watchAll=false --coverage && cd ../..`
2. Check exit code:
   - Exit code 0: Tests passed and coverage thresholds met (75%
     lines/functions/statements, 70% branches)
   - Non-zero: Tests failed or coverage below threshold
3. Record the result

### 2.4 Test Smoker

1. Run:
   `cd apps/smoker && CI=true npm test -- --watchAll=false --coverage && cd ../..`
2. Check exit code:
   - Exit code 0: Tests passed and coverage thresholds met (80%
     lines/functions/statements, 75% branches)
   - Non-zero: Tests failed or coverage below threshold
3. Record the result

### 2.5 Test TemperatureChart Package

1. Run: `npm run test:coverage --prefix packages/TemperatureChart`
2. Check exit code:
   - Exit code 0: Tests passed and coverage thresholds met (75%
     lines/branches/statements, 45% functions)
   - Non-zero: Tests failed or coverage below threshold
3. Record the result

## Step 3: Run Build Validation

Build all applications to ensure they compile correctly. TypeScript compilation
errors will be caught here.

### 3.1 Build Backend

1. Run: `npm run build --prefix apps/backend`
2. Check exit code:
   - Exit code 0: Build successful
   - Non-zero: Build failed (TypeScript errors, missing dependencies, etc.)
3. Record the result

### 3.2 Build Device Service

1. Run: `npm run build --prefix apps/device-service`
2. Check exit code:
   - Exit code 0: Build successful
   - Non-zero: Build failed
3. Record the result

### 3.3 Build Frontend

1. Run: `npm run build --prefix apps/frontend`
2. Check exit code:
   - Exit code 0: Build successful
   - Non-zero: Build failed
3. Record the result

### 3.4 Build Smoker

1. Run: `npm run build:prod --prefix apps/smoker`
2. Check exit code:
   - Exit code 0: Build successful
   - Non-zero: Build failed
3. Record the result

## Step 4: Generate Summary Report

Create a comprehensive summary of all check results:

### 4.1 Format the Summary

Present the results in a clear format:

```
## Pre-commit Check Results

### Code Quality
- Formatting: ✅ Passed / ❌ Failed
- Linting: ✅ Passed / ❌ Failed

### Tests with Coverage
- Backend: ✅ Passed / ❌ Failed
- Device Service: ✅ Passed / ❌ Failed
- Frontend: ✅ Passed / ❌ Failed
- Smoker: ✅ Passed / ❌ Failed
- TemperatureChart: ✅ Passed / ❌ Failed

### Build Validation
- Backend: ✅ Passed / ❌ Failed
- Device Service: ✅ Passed / ❌ Failed
- Frontend: ✅ Passed / ❌ Failed
- Smoker: ✅ Passed / ❌ Failed

### Overall Status
✅ All checks passed - Ready to push!
OR
❌ Some checks failed - Please fix issues before pushing
```

### 4.2 Provide Details for Failures

For each failed check:

- Show the error output or a summary
- Provide suggestions for fixing the issue
- Reference the coverage thresholds if tests failed due to coverage

### 4.3 Final Recommendation

- If all checks passed: "✅ All checks passed! Your code is ready to push and
  should pass PR checks."
- If any checks failed: "❌ Some checks failed. Please fix the issues above
  before pushing. The PR checks will fail if these issues are not resolved."

## Step 5: Create Fix Plan (If Checks Failed)

**Only execute this step if any checks failed in Steps 1-3.**

1. **Analyze all failures**:
   - Review all failed checks from the summary
   - For each failure, analyze the error output to understand the root cause
   - Identify which files need to be fixed
   - Determine the type of fix needed (formatting, linting, test fixes, build
     fixes, coverage improvements)

2. **Create a comprehensive fix plan**:
   - Use the `mcp_create_plan` tool to create a detailed plan
   - The plan should include:
     - Overview of all issues that need to be fixed
     - Specific files that need changes
     - Step-by-step approach to fix each issue
     - Order of fixes (e.g., fix formatting/linting first, then tests, then
       builds)
   - Make the plan actionable and specific
   - Include code snippets or file paths where relevant

3. **Present the plan to the user**:
   - Show the complete plan
   - Ask: "I've created a plan to fix all the failing checks. Would you like me
     to proceed with implementing these fixes?"
   - Wait for user approval before proceeding

4. **If user approves**:
   - Implement the fixes according to the plan
   - After implementing fixes, re-run the relevant checks to verify they pass
   - Update the summary report with the new results
   - If all checks now pass, inform the user: "✅ All fixes have been applied
     and verified. Your code is now ready to push!"

5. **If user does not approve**:
   - Inform the user: "Fix plan created but not implemented. You can review the
     plan and fix the issues manually, or ask me to implement it later."
   - Provide the plan for their reference

## Error Handling

### If a test fails:

- Show the test output or error message
- Indicate if it's a test failure or coverage threshold failure
- Suggest running the test individually for more details

### If a build fails:

- Show the build error output
- Common issues: TypeScript errors, missing dependencies, configuration issues
- Suggest checking the specific app's build output

### If code quality checks fail:

- Show which files have issues
- Offer to auto-fix where possible
- Remind user that these can be fixed automatically

## Performance Notes

- These checks may take several minutes to complete
- Tests and builds run sequentially to avoid resource conflicts
- Provide progress updates: "Running backend tests...", "Building frontend...",
  etc.

## Important Notes

- All checks must pass for the code to be ready to push
- Coverage thresholds are enforced - tests will fail if thresholds are not met
- TypeScript compilation is validated during the build step
- Formatting and linting issues can often be auto-fixed
- If checks fail, fix the issues and re-run this command before pushing
