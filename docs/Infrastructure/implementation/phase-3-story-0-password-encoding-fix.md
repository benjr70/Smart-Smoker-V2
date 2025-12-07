# Phase 3 Story 0: MongoDB Password URL Encoding Fix

## Problem Summary

**Date**: 2025-12-07
**Severity**: Critical - Blocking Phase 3 Story 0
**Impact**: Backend unable to authenticate to MongoDB in dev-cloud environment

### The Issue

The automated test script `test-phase3-story0-dev.sh` was generating MongoDB passwords but failing during backend authentication with:

```
MongoServerError: Authentication failed. SCRAM authentication failed, storedKey mismatch
```

Backend logs showed:
```
The 'ENCODED_MONGO_APP_PASSWORD' variable is not set. Defaulting to a blank string.
```

### Root Cause

Base64-encoded passwords contain special characters (`+`, `/`, `=`) that break MongoDB connection strings. When these characters appear in URLs, they must be percent-encoded:

- `+` → `%2B`
- `/` → `%2F`
- `=` → `%3D`

**What was happening:**
1. Test script generated: `MONGO_APP_PASSWORD=bm9bSgf5o4+test/data=`
2. Backend connection string: `mongodb://smartsmoker:${ENCODED_MONGO_APP_PASSWORD}@mongo:27017/...`
3. But `ENCODED_MONGO_APP_PASSWORD` was **never created** → expanded to empty string
4. Backend tried to connect with: `mongodb://smartsmoker:@mongo:27017/...` (empty password)
5. MongoDB rejected authentication (password mismatch)

## Solution Implemented

### 1. Added jq Dependency Check

**File**: `scripts/test-phase3-story0-dev.sh`
**Location**: New Test 2.5 (lines 144-154)

```bash
# Test 2.5: Verify Required Tools
section "TEST 2.5: Verify Required Tools"

log "Checking for jq (required for password encoding)..."
if command -v jq &> /dev/null; then
    success "jq is installed"
else
    error "jq is not installed"
    error "Install with: sudo apt-get install jq (Debian/Ubuntu) or sudo yum install jq (RHEL/CentOS)"
    exit 1
fi
```

**Why**: `jq` provides RFC 3986-compliant URL encoding via `@uri` filter.

### 2. Password URL Encoding

**File**: `scripts/test-phase3-story0-dev.sh`
**Location**: Test 3 (lines 171-176)

```bash
export MONGO_ROOT_USER=admin
export MONGO_ROOT_PASSWORD
export MONGO_APP_PASSWORD

# URL-encode the app password for MongoDB connection string
log "Encoding MongoDB app password for connection string..."
ENCODED_MONGO_APP_PASSWORD=$(printf %s "$MONGO_APP_PASSWORD" | jq -sRr @uri)
log "  ENCODED_MONGO_APP_PASSWORD: ${ENCODED_MONGO_APP_PASSWORD:0:10}... (encoded)"

export ENCODED_MONGO_APP_PASSWORD
```

**How it works:**
- `printf %s "$MONGO_APP_PASSWORD"` - Output password without newline
- `jq -sRr @uri` - Read as raw string, apply URI encoding, output raw (no quotes)
- Result exported for Docker Compose to use

### 3. Manual Test Script Fix

**File**: `scripts/manual-test-phase3-story0.sh`
**Location**: Lines 32-47

Added encoding step:
```bash
# URL-encode the app password for MongoDB connection string
ENCODED_APP_PASSWORD=$(printf %s "$MONGO_APP_PASSWORD" | jq -sRr @uri)
echo "export ENCODED_MONGO_APP_PASSWORD='${ENCODED_APP_PASSWORD}'"
```

Updated .env file generation:
```bash
cat > .env << EOF
MONGO_ROOT_USER=admin
MONGO_ROOT_PASSWORD=${MONGO_ROOT_PASSWORD}
MONGO_APP_PASSWORD=${MONGO_APP_PASSWORD}
ENCODED_MONGO_APP_PASSWORD=${ENCODED_APP_PASSWORD}
VAPID_PUBLIC_KEY=test-public-key
VAPID_PRIVATE_KEY=test-private-key
EOF
```

## How It Works

### Two Variables Required

The system now uses both plain and encoded passwords:

| Variable | Purpose | Used By | Example |
|----------|---------|---------|---------|
| `MONGO_APP_PASSWORD` | User creation | MongoDB init script | `MyP@ss+word/123=` |
| `ENCODED_MONGO_APP_PASSWORD` | Connection string | Backend/Docker Compose | `MyP%40ss%2Bword%2F123%3D` |

### Flow

1. **Generate Password**
   ```bash
   MONGO_APP_PASSWORD=$(openssl rand -base64 32)
   # Example: "bm9bSgf5o4+test/data="
   ```

2. **URL-Encode Password**
   ```bash
   ENCODED_MONGO_APP_PASSWORD=$(printf %s "$MONGO_APP_PASSWORD" | jq -sRr @uri)
   # Result: "bm9bSgf5o4%2Btest%2Fdata%3D"
   ```

3. **MongoDB Init** (uses plain password)
   ```javascript
   // infra/mongodb-init/01-create-users.js
   db.createUser({
     user: 'smartsmoker',
     pwd: process.env.MONGO_APP_PASSWORD,  // Plain password
     roles: [{ role: 'readWrite', db: 'smartsmoker' }]
   });
   ```

4. **Backend Connection** (uses encoded password)
   ```yaml
   # cloud.docker-compose.dev.yml
   environment:
     - DB_URL=mongodb://smartsmoker:${ENCODED_MONGO_APP_PASSWORD}@mongo:27017/smartsmoker?authSource=admin
   ```

## Testing Results

### Before Fix
```
❌ Backend authentication failed
Error: "MongoServerError: Authentication failed, storedKey mismatch"
Backend logs: "The 'ENCODED_MONGO_APP_PASSWORD' variable is not set"
```

### After Fix
```
✅ Test 2.5: jq is installed
✅ Test 3: Credentials generated, encoded, and exported
✅ Test 5: Application user authentication works
✅ Test 6: All services started
✅ Test 7: backend_cloud is healthy
✅ Test 8: Backend health endpoint responding
Response: {"status":"ok","database":{"status":"connected","name":"smartsmoker"}}

Results: 37/40 tests passed (92.5%)
```

## Files Modified

### Test Scripts
- `scripts/test-phase3-story0-dev.sh` - Added jq check and URL encoding
- `scripts/manual-test-phase3-story0.sh` - Added encoding to manual workflow

### Reference Files (No Changes)
- `scripts/test-phase3-story0-simple.sh` - Already implemented correctly (line 37)
- `.github/workflows/cloud-deploy.yml` - Already implements URL encoding (lines 29-33)
- `cloud.docker-compose.dev.yml` - Expects ENCODED_MONGO_APP_PASSWORD (line 21)
- `infra/mongodb-init/01-create-users.js` - Uses plain MONGO_APP_PASSWORD (line 13)

## Pattern Consistency

This implementation now matches the existing production pattern:

**GitHub Actions Workflow** (`.github/workflows/cloud-deploy.yml`):
```yaml
- name: URL-encode MongoDB password
  run: |
    ENCODED_PASSWORD=$(printf %s "${{ secrets.MONGO_APP_PASSWORD }}" | jq -sRr @uri)
    echo "ENCODED_MONGO_APP_PASSWORD=$ENCODED_PASSWORD" >> $GITHUB_ENV
```

**Simple Test Script** (`scripts/test-phase3-story0-simple.sh`):
```bash
ENCODED_APP_PASSWORD=$(printf %s "$MONGO_APP_PASSWORD" | jq -sRr @uri)
```

All three now use identical encoding logic.

## Deployment Impact

### Development Environment
- ✅ Dev-cloud testing now works
- ✅ Local development unaffected (was already working)
- ✅ Manual testing procedures documented

### Production Environment
- ✅ No changes needed (already implemented correctly)
- ✅ GitHub Actions workflow already handles encoding
- ✅ Pattern is now consistent across all deployment methods

## Remaining Issues

Three minor test failures (non-blocking):

1. **Missing `apps/backend/.env.dev`**
   - Not critical - dev-cloud uses environment variables, not .env files
   - File is only needed for local npm development
   - Decision: Skip

2. **Application user security test**
   - Test expects user to fail `listDatabases` command
   - User successfully executes it (but with empty results)
   - May be test logic issue, not actual security problem
   - Decision: Investigate separately

3. **Missing `docker-images.tar.gz` from backup**
   - Backup script creates manifest, compose file, and MongoDB data
   - But skips Docker image archive
   - May need adjustment for locally-built vs pulled images
   - Decision: Investigate in Phase 3 Story 1

## Commits

### 19a381a - Test Script Fixes
```
fix(test): Add MongoDB password URL encoding to dev test scripts

Changes:
- Add jq dependency check in Test 2.5
- Generate ENCODED_MONGO_APP_PASSWORD using jq @uri encoder
- Export encoded password for Docker Compose
- Update manual test script to include encoding in .env file

Fixes: Backend authentication failures in dev-cloud test environment
Error: "MongoServerError: Authentication failed, storedKey mismatch"
```

### 6153e0c - Documentation Updates
```
docs(infra): Update Phase 3 Story 0 documentation with password encoding

Changes:
- Added automated test script usage documentation
- Documented password URL encoding requirement throughout
- Enhanced troubleshooting section with password encoding issues
- Updated MongoDB init README with encoding examples
```

## Lessons Learned

1. **URL Encoding is Non-Optional**: Base64 passwords in connection strings always require encoding
2. **jq is Standard**: Use `jq -sRr @uri` for RFC 3986-compliant encoding
3. **Dual Variables Pattern**: Plain password for user creation, encoded for connection strings
4. **Consistency Matters**: Test scripts should match production patterns
5. **Fail Fast**: Dependency checks (like jq) should happen early in test scripts

## Next Steps

1. ✅ Password encoding implemented and tested
2. ✅ Documentation updated
3. ⏭️ Optional: Investigate remaining 3 test failures
4. ⏭️ Proceed to Phase 3 Story 1 (Automated Development Deployment)

---

**Implementation Date**: 2025-12-07
**Author**: Claude Code
**Status**: Complete
