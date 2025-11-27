# GitHub Secrets Setup Guide

This guide explains how to configure GitHub Secrets for Phase 3 Story 0 MongoDB authentication.

## Required Secrets

The following secrets must be added to your GitHub repository for the cloud deployment workflow to function with MongoDB 7.0 authentication:

| Secret Name | Description | Example Value | Security Level |
|-------------|-------------|---------------|----------------|
| `MONGO_ROOT_USER` | MongoDB admin username | `admin` | HIGH |
| `MONGO_ROOT_PASSWORD` | MongoDB admin password | `<strong-random-password>` | CRITICAL |
| `MONGO_APP_PASSWORD` | Application user password | `<strong-random-password>` | CRITICAL |

## How to Add GitHub Secrets

### Step 1: Navigate to Repository Settings

1. Go to your GitHub repository: `https://github.com/YOUR_USERNAME/Smart-Smoker-V2`
2. Click **Settings** (top navigation bar)
3. In the left sidebar, click **Secrets and variables** → **Actions**

### Step 2: Add Each Secret

For each required secret:

1. Click **New repository secret**
2. Enter the **Name** (e.g., `MONGO_ROOT_USER`)
3. Enter the **Secret** value
4. Click **Add secret**

### Step 3: Generate Secure Passwords

**IMPORTANT**: Use strong, unique passwords for MongoDB credentials.

#### Option 1: Using OpenSSL (Linux/Mac)
```bash
# Generate a 32-character random password
openssl rand -base64 32
```

#### Option 2: Using Python
```bash
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

#### Option 3: Using a Password Manager
- Use 1Password, Bitwarden, or LastPass to generate strong passwords
- Recommended: 32+ characters with mixed case, numbers, and symbols

### Step 4: Configure Secrets

Add these three secrets with strong passwords:

**Secret 1: MONGO_ROOT_USER**
```
Name: MONGO_ROOT_USER
Secret: admin
```

**Secret 2: MONGO_ROOT_PASSWORD**
```
Name: MONGO_ROOT_PASSWORD
Secret: <paste-generated-password-1>
```
Example: `xK9mP2vN8qL5zR4tB7wC3yF6hJ1aD0sG`

**Secret 3: MONGO_APP_PASSWORD**
```
Name: MONGO_APP_PASSWORD
Secret: <paste-generated-password-2>
```
Example: `bQ8nT5vR2wM9pL4xK7yC1zN6hF3aJ0sD`

## Verification

After adding secrets, verify they appear in your repository:

1. Go to **Settings** → **Secrets and variables** → **Actions**
2. You should see:
   - `MONGO_ROOT_USER`
   - `MONGO_ROOT_PASSWORD`
   - `MONGO_APP_PASSWORD`
   - `VAPID_PRIVATE_KEY` (existing)
   - `VAPID_PUBLIC_KEY` (existing)

## Security Best Practices

### ✅ DO:
- Use strong, randomly generated passwords (32+ characters)
- Store passwords in a password manager
- Use different passwords for root and application users
- Rotate passwords periodically (quarterly recommended)
- Limit access to production secrets to essential personnel only

### ❌ DON'T:
- Use simple or guessable passwords
- Reuse passwords across environments
- Share passwords via email or chat
- Commit passwords to version control
- Use the same password for dev and prod

## Local Development

For local development (not in GitHub Actions), you'll need to set environment variables:

**For Dev Cloud Testing:**

Create a local `.env` file (NOT committed to git):

```bash
# .env.local (for local testing only - DO NOT COMMIT)
MONGO_ROOT_USER=admin
MONGO_ROOT_PASSWORD=<your-dev-password>
MONGO_APP_PASSWORD=<your-dev-app-password>
VAPID_PUBLIC_KEY=BDb95f2IXgHf2pwHegV4DGNvyKoHSzp0tPOqhpB7WOgjAt8GmGuGK9RyE7-Ltzprdlp3ftq1xR94ff7j3EXYsEs
VAPID_PRIVATE_KEY=056QmHxzfE9zNL93Ewtdxa_p3CYQVnojTD738X36gGY
```

**Ensure `.env.local` is in `.gitignore`:**
```bash
echo ".env.local" >> .gitignore
```

## Testing Secrets

After adding secrets, you can test the deployment workflow:

1. Trigger a manual workflow run via GitHub Actions UI
2. Check the workflow logs to ensure MongoDB containers start successfully
3. Verify no authentication errors in the logs

## Password Rotation

To rotate MongoDB passwords:

1. **Generate new passwords** using one of the methods above
2. **Update GitHub Secrets** with new values
3. **Redeploy** the application (forces new user creation)
4. **Update local development** environment variables if applicable

## Troubleshooting

### Error: "Authentication failed"
- Verify secrets are named exactly as specified (case-sensitive)
- Ensure no extra spaces in secret values
- Check that secrets are available in the repository (not organization-level)

### Error: "MONGO_ROOT_PASSWORD not set"
- Secret name must match exactly: `MONGO_ROOT_PASSWORD`
- Verify the secret exists in **Settings** → **Secrets and variables** → **Actions**

### Error: "Cannot connect to MongoDB"
- Check that application user password matches `MONGO_APP_PASSWORD` secret
- Verify `.env.prod` file has correct connection string format
- Ensure MongoDB container started successfully

## Additional Resources

- [GitHub Encrypted Secrets Documentation](https://docs.github.com/en/actions/security-guides/encrypted-secrets)
- [MongoDB Authentication Documentation](https://www.mongodb.com/docs/manual/core/authentication/)
- [Password Security Best Practices](https://pages.nist.gov/800-63-3/sp800-63b.html)

---

**Status**: Required for Phase 3 Story 0
**Priority**: CRITICAL - Deployment will fail without these secrets
**Last Updated**: 2025-11-27
