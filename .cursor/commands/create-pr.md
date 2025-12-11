# Create Pull Request

You are tasked with creating a pull request using the GitHub CLI (`gh`). Follow
these steps carefully:

## Prerequisites Check

1. **Check if GitHub CLI is installed**: Run `gh --version`. If it's not
   installed, inform the user they need to install it first.
2. **Check if authenticated**: Run `gh auth status`. If not authenticated,
   inform the user they need to run `gh auth login` first.
3. **Verify git repository**: Ensure you're in a git repository with a remote
   origin configured.

## Step 1: Check Current Branch

1. Get the current branch name: `git branch --show-current`
2. Store this value for later use.

## Step 2: Branch Handling

### If on master or main branch:

1. **Ask the user for branch information**:
   - Branch type: Ask "What type of branch? (feature/bug/hotfix)"
   - Jira number: Ask "What is the Jira number? (e.g., 14 for SS2-14)"
   - Description: Ask "What is a brief description? (e.g., 'login' for login
     feature)"

2. **Create the branch** following the project naming convention:
   - Format: `{type}/SS2-{number}-{description}`
   - Example: If user says feature, 14, login → create `feature/SS2-14-login`
   - Command: `git checkout -b {branch-name}`

3. **Update the stored branch name** to the newly created branch.

### If already on a feature/bug/hotfix branch:

1. Use the current branch as-is.
2. Inform the user: "Using existing branch: {branch-name}"

## Step 3: Check for Uncommitted Changes

1. Check for uncommitted changes: `git status --porcelain`
2. If there are changes:
   - Check staged changes: `git diff --staged`
   - Check unstaged changes: `git diff`
   - Analyze the changes to understand what was modified:
     - Look at file paths and types (e.g., TypeScript files, tests, configs)
     - Identify the main purpose of changes (e.g., "Add login functionality",
       "Fix bug in temperature sensor", "Update dependencies")
   - **Auto-generate a commit message** based on the changes:
     - Use conventional commit format if appropriate
     - Be descriptive but concise
     - Example: "feat: add user login functionality" or "fix: resolve
       temperature sensor reading issue"
   - Stage all changes: `git add .`
   - Commit with the generated message: `git commit -m "{generated-message}"`
   - Show the user the commit message and confirm it was created
3. If no changes exist:
   - Inform the user: "No uncommitted changes found. Skipping commit step."

## Step 4: Run Pre-commit Checks

**Before pushing, run all pre-commit checks to ensure code will pass PR
checks.**

1. **Run pre-commit checks**:
   - Follow the instructions in `.cursor/commands/pre-commit.md`
   - This will run all tests, builds, linting, and formatting checks
   - Wait for all checks to complete

2. **Evaluate results**:
   - If all checks pass: Proceed to Step 5 (Push Branch to Remote)
   - If any checks fail:
     - The pre-commit command will create a fix plan and ask for approval
     - Wait for user to approve or reject the fix plan
     - If user approves fixes: Implement fixes, re-run checks, and only proceed
       to push if all checks now pass
     - If user rejects fixes: Ask "Pre-commit checks failed. Would you like to
       push anyway, or would you prefer to fix the issues first?"
       - If user wants to push anyway: Warn them that PR checks will likely
         fail, then proceed to Step 5
       - If user wants to fix first: Stop here and let them fix issues manually

3. **Important**: Do not push code that fails pre-commit checks unless the user
   explicitly requests it after being warned about potential PR check failures.

## Step 5: Push Branch to Remote

1. Get the current branch name again: `git branch --show-current`
2. Push the branch to origin: `git push -u origin {branch-name}`
3. If the branch already exists remotely:
   - The push should still work, but if there's a conflict, inform the user they
     may need to pull first or force push (ask for confirmation before force
     pushing).

## Step 6: Generate PR Description

1. **Read the PR template**: Read `.github/pull_request_template.md`
2. **Analyze the changes** for the PR description:
   - Get recent commit messages: `git log origin/master..HEAD --oneline` (or
     `origin/main` if main is the base)
   - Get file changes summary: `git diff origin/master..HEAD --stat` (or
     `origin/main`)
   - Understand what files were changed and their purpose
3. **Generate initial PR description**:
   - **Description section**: Write a clear summary of what this PR does, based
     on the commits and file changes
   - **Include the requirements checklist** from the template (copy the
     checklist structure)
   - Make it informative and helpful for reviewers
4. **Generate PR title**:
   - Use the branch name to create a readable title
   - Example: `feature/SS2-14-login` → "feat: Add user login functionality
     (SS2-14)"
   - Or: `bug/SS2-23-temp-sensor` → "fix: Resolve temperature sensor reading
     issue (SS2-23)"

## Step 7: Get User Approval for PR Description

1. **Present the PR description to the user**:
   - Show the title
   - Show the full description including the checklist
2. **Ask for approval**: "Please review the PR description above. Would you like
   to use this as-is, or would you like to modify it?"
3. **If user wants to modify**:
   - Ask what changes they'd like to make
   - Update the description accordingly
   - Show the updated version and confirm
4. **If user approves or says it's fine**:
   - Proceed to create the PR

## Step 8: Create the Pull Request

1. **Create the PR using GitHub CLI**:

   ```
   gh pr create --title "{pr-title}" --body "{pr-description}" --base master
   ```

   (Use `main` instead of `master` if the default branch is `main`)

2. **Handle the response**:
   - If successful, show the PR URL to the user
   - If there's an error, display the error message and help troubleshoot

## Step 9: Summary

1. Provide a summary of what was done:
   - Branch created/used: {branch-name}
   - Commits made: {number} commit(s)
   - PR created: {pr-url}
   - PR title: {pr-title}

## Error Handling

- If `gh` is not installed: Stop and inform the user
- If not authenticated: Stop and inform the user
- If branch creation fails: Show error and ask user what to do
- If commit fails: Show error and ask user what to do
- If push fails: Show error and suggest solutions (pull, rebase, etc.)
- If PR creation fails: Show error message and help troubleshoot

## Important Notes

- Always use `master` as the base branch unless the repository uses `main`
- Follow the project's branch naming convention strictly:
  `{type}/SS2-{number}-{description}`
- Auto-generate commit messages based on actual changes, not generic messages
- Include the requirements checklist from the template in the PR description
- Be helpful and informative in error messages
