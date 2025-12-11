# PR Check Fail Fix

You are tasked with checking a PR's failing checks, analyzing the logs, creating
a fix plan, and implementing fixes. Follow these steps carefully:

## Prerequisites Check

1. **Check if GitHub CLI is installed**: Run `gh --version`. If it's not
   installed, inform the user they need to install it first.

2. **Check if authenticated**: Run `gh auth status`. If not authenticated,
   inform the user they need to run `gh auth login` first.

3. **Verify git repository**: Ensure you're in a git repository with a remote
   origin configured.

## Step 1: Determine PR to Check

1. **Get current branch**: Run `git branch --show-current` and store the result.

2. **Check if on master/main**:
   - If current branch is `master` or `main`:
     - Ask the user: "You're on master/main. Please provide either a branch name
       or PR number to check."
     - Store the provided branch name or PR number
     - If branch name provided, use it to find the PR
     - If PR number provided, use it directly

3. **If on a feature/bug/hotfix branch**:
   - Automatically find the PR for this branch:
     - Run: `gh pr list --head {branch-name} --json number,title,state`
     - Parse the JSON output to find the PR number
   - If PR found:
     - Use that PR number
     - Inform the user: "Found PR #{pr-number}: {title} for branch
       {branch-name}"
   - If no PR found:
     - Ask the user: "No PR found for branch {branch-name}. Would you like to
       create a PR, or provide a PR number to check?"
     - If user provides PR number, use it
     - If user wants to create PR, suggest using the create-pr command

4. **Store the PR number and branch name** for later use.

## Step 2: Check PR Status

1. **Get PR details**:
   - Run:
     `gh pr view {pr-number} --json statusCheckRollup,state,title,headRefName,number`
   - Parse the JSON to extract:
     - PR state (open, closed, merged)
     - PR title
     - Head branch name
     - Status check rollup

2. **Check if PR is open**:
   - If PR state is not "OPEN", inform the user: "PR #{pr-number} is {state}.
     Only open PRs can have failing checks."
     - Ask if they want to check a different PR

3. **Analyze status checks**:
   - Parse the `statusCheckRollup` array from the JSON
   - Identify checks with:
     - `conclusion: "failure"` OR
     - `status: "completed"` AND `conclusion: "failure"` OR
     - `status: "in_progress"` (these may fail later, but focus on completed
       failures first)
   - Count total checks and failing checks

4. **Evaluate results**:
   - If no failing checks found:
     - Inform the user: "All PR checks are passing for PR #{pr-number}. No fixes
       needed."
     - Exit gracefully
   - If failing checks found:
     - Inform the user: "Found {count} failing check(s) for PR #{pr-number}:
       {list of failing check names}"
     - Proceed to next step

## Step 3: Get Failing Check Logs

1. **List all checks for the PR**:
   - Run: `gh pr checks {pr-number}`
   - This will show all checks and their status
   - Identify which checks have failed

2. **Get workflow run information**:
   - For each failing check, get the workflow run:
     - Run:
       `gh run list --branch {head-branch-name} --limit 10 --json databaseId,conclusion,status,name,workflowName,displayTitle`
     - Find runs with `conclusion: "failure"` or `status: "completed"` with
       `conclusion: "failure"`
     - Match runs to failing checks by workflow name or check name

3. **Retrieve logs for each failing check**:
   - For each failed run, get the logs:
     - Run: `gh run view {run-id} --log-failed` (for just failed steps)
     - OR: `gh run view {run-id} --log` (for full logs)
   - Store the logs for analysis
   - If `--log-failed` doesn't provide enough context, use `--log` to get full
     logs

4. **Analyze logs to understand failures**:
   - For each failing check, analyze the logs to identify:
     - **Test failures**: Which tests failed, error messages, stack traces
     - **Build failures**: TypeScript errors, compilation issues, missing
       dependencies
     - **Linting/formatting failures**: Which files have issues, specific
       linting errors
     - **Coverage failures**: Which apps failed coverage thresholds, current vs
       required coverage
   - Extract key error messages and file paths
   - Identify patterns (e.g., multiple files with same linting issue)

5. **Organize failure information**:
   - Group failures by type (tests, builds, linting, coverage)
   - For each failure, note:
     - Check/workflow name
     - Error type
     - Affected files/apps
     - Key error messages
     - Root cause (if identifiable)

## Step 4: Create Fix Plan

1. **Analyze all failing check logs**:
   - Review all collected failure information
   - Identify root causes:
     - **Test failures**: Which specific tests failed and why (assertion errors,
       missing mocks, etc.)
     - **Build failures**: TypeScript errors (type mismatches, missing types,
       etc.), missing dependencies, configuration issues
     - **Linting/formatting**: Which files have linting errors, what rules are
       violated
     - **Coverage**: Which apps need more test coverage, which files are
       uncovered

2. **Create a comprehensive fix plan**:
   - Use the `mcp_create_plan` tool to create a detailed plan
   - The plan should include:
     - **Overview**: Summary of all issues that need to be fixed
     - **Specific files**: List files that need changes with their issues
     - **Step-by-step approach**: Detailed steps to fix each issue
     - **Order of fixes**: Fix formatting/linting first, then test fixes, then
       build fixes, then coverage improvements
     - **Code snippets**: Include relevant code snippets or file paths where
       applicable
   - Make the plan actionable and specific
   - Group related fixes together

3. **Present the plan to the user**:
   - Show the complete fix plan
   - Highlight the key issues and proposed fixes
   - Explain the order of fixes and why

## Step 5: Get User Approval

1. **Present the fix plan**:
   - Show the complete plan created in Step 4
   - Summarize what will be fixed

2. **Ask for approval**:
   - Ask: "I've analyzed the failing PR checks and created a plan to fix them.
     Would you like me to proceed with implementing these fixes?"
   - Wait for user approval

3. **If user approves**:
   - Proceed to Step 6 (Implement Fixes)

4. **If user does not approve**:
   - Inform the user: "Fix plan created but not implemented. You can review the
     plan and fix the issues manually, or ask me to implement it later."
   - Provide the plan for their reference
   - Exit gracefully

## Step 6: Implement Fixes (If Approved)

1. **Execute the plan step by step**:
   - Follow the fix plan created in Step 4
   - Work through each fix in the specified order

2. **For each fix**:
   - Make the necessary code changes
   - If it's a formatting/linting fix:
     - Run the appropriate fix command (e.g., `npm run format`,
       `npm run lint:apps:fix`)
   - If it's a test fix:
     - Update the test code or implementation
     - If possible, run the specific test locally to verify:
       `npm test --prefix apps/{app} -- {test-name}`
   - If it's a build fix:
     - Fix TypeScript errors, add missing dependencies, update configs
     - If possible, try building locally: `npm run build --prefix apps/{app}`
   - If it's a coverage fix:
     - Add tests for uncovered code
     - Run tests with coverage to verify: `npm run test:cov --prefix apps/{app}`

3. **After all fixes are implemented**:
   - Provide a summary of what was fixed:
     - List each fix that was applied
     - Mention any files that were modified
     - Note if any fixes required manual intervention

## Step 7: Commit and Push

1. **Check for uncommitted changes**:
   - Run: `git status --porcelain`
   - If no changes: Inform user "No changes to commit. Fixes may have been
     applied automatically or need manual intervention."

2. **If changes exist**:
   - **Analyze the changes** to generate a good commit message:
     - Run: `git diff --staged` and `git diff` to see what changed
     - Identify the types of fixes (tests, builds, linting, coverage)
     - Generate a descriptive commit message:
       - Use conventional commit format: `fix: resolve failing PR checks`
       - Include summary: `- Fix test failures in {apps}`
       - Add details: `- Resolve linting issues in {files}`
       - Mention coverage if applicable: `- Improve test coverage for {apps}`
     - Example: "fix: resolve failing PR checks - Fix test failures in backend,
       resolve linting issues, update coverage for frontend"

   - **Stage all changes**:
     - Run: `git add .`

   - **Commit with generated message**:
     - Run: `git commit -m "{generated-message}"`
     - Show the user the commit message and confirm it was created

   - **Get current branch name**:
     - Run: `git branch --show-current`

   - **Push to remote**:
     - Run: `git push origin {branch-name}`
     - If push fails:
       - Show the error message
       - Suggest solutions (pull, rebase, etc.)
       - Ask user if they want to proceed with suggested fix

3. **Verify push was successful**:
   - Confirm the push completed successfully
   - Inform user: "Fixes have been committed and pushed to {branch-name}"

## Step 8: Summary

1. **Provide a comprehensive summary**:
   - PR checked: PR #{pr-number} ({pr-title})
   - Branch: {branch-name}
   - Failing checks identified: {list of failing check names}
   - Fixes implemented: {summary of fixes}
   - Files modified: {list of files}
   - Committed: {commit-hash} with message "{commit-message}"
   - Pushed to: {branch-name}

2. **Next steps**:
   - Inform user: "The fixes have been pushed. The PR checks should re-run
     automatically. You can monitor the PR to see if the checks pass."
   - Suggest: "If checks still fail, you can run this command again to analyze
     any remaining issues."

## Error Handling

- **If `gh` is not installed**: Stop and inform user they need to install GitHub
  CLI

- **If not authenticated**: Stop and inform user to run `gh auth login`

- **If no PR found for branch**: Ask user to create PR or provide PR number

- **If PR has no failing checks**: Inform user and exit gracefully

- **If logs cannot be retrieved**: Try alternative methods (e.g., use
  `gh run view` with different flags) or inform user that logs may not be
  available

- **If fixes cannot be applied**: Show error and suggest manual fixes or ask
  user for guidance

- **If commit fails**: Show error and ask user what to do

- **If push fails**: Show error message and suggest solutions (pull, rebase,
  force push with confirmation)

## Important Notes

- Always check PR status before attempting fixes
- Pull detailed logs to understand root causes - don't guess what's wrong
- Create comprehensive fix plan before implementing - this helps ensure all
  issues are addressed
- Get user approval before making any changes - never implement fixes without
  approval
- Generate descriptive commit messages that explain what was fixed
- Verify fixes are pushed successfully
- If checks still fail after fixes, the user can run this command again

## GitHub CLI Commands Reference

Key commands used in this workflow:

- `gh pr list --head {branch} --json number,title,state` - Find PR for a branch
- `gh pr view {number} --json statusCheckRollup,state,title,headRefName` - Get
  PR details and check status
- `gh pr checks {number}` - List all checks for a PR
- `gh run list --branch {branch} --json databaseId,conclusion,status,name` -
  List workflow runs for a branch
- `gh run view {run-id} --log-failed` - Get logs for failed steps only
- `gh run view {run-id} --log` - Get full logs for a workflow run
