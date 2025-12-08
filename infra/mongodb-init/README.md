# MongoDB Initialization Scripts

This directory contains initialization scripts that run when the MongoDB container starts for the first time.

## Scripts

### `01-create-users.js`

Creates two MongoDB users:

1. **Admin User** (root privileges)
   - Username: From `MONGO_INITDB_ROOT_USERNAME` environment variable
   - Password: From `MONGO_INITDB_ROOT_PASSWORD` environment variable
   - Roles: `root` (full database access)

2. **Application User** (limited privileges)
   - Username: `smartsmoker`
   - Password: From `MONGO_APP_PASSWORD` environment variable
   - Roles: `readWrite` on `smartsmoker` database only

## Usage

These scripts are automatically executed by MongoDB when:
- The container starts for the first time
- The `/data/db` directory is empty
- The scripts are mounted to `/docker-entrypoint-initdb.d/`

The initialization only runs once. If the database already exists, these scripts are skipped.

## Environment Variables Required

### For MongoDB Container

```bash
MONGO_INITDB_ROOT_USERNAME=admin
MONGO_INITDB_ROOT_PASSWORD=<secure-password>
MONGO_APP_PASSWORD=<secure-password>
```

### For Backend Application

The backend also requires the URL-encoded version of the app password:

```bash
MONGO_APP_PASSWORD=<secure-password>
ENCODED_MONGO_APP_PASSWORD=<url-encoded-password>
```

**Generating Encoded Password:**

```bash
# Generate base64 password
MONGO_APP_PASSWORD=$(openssl rand -base64 32)

# URL-encode it for connection string (requires jq)
ENCODED_MONGO_APP_PASSWORD=$(printf %s "$MONGO_APP_PASSWORD" | jq -sRr @uri)
```

**Why URL Encoding is Required:**

Base64 passwords contain special characters (`+`, `/`, `=`) that have special meaning in URLs. MongoDB connection strings follow URL format, so these characters must be percent-encoded:
- `+` → `%2B`
- `/` → `%2F`
- `=` → `%3D`

Example:
```
# Plain password:  MyPass+word/123=
# Encoded:         MyPass%2Bword%2F123%3D

# Connection string uses encoded password:
mongodb://smartsmoker:MyPass%2Bword%2F123%3D@mongo:27017/smartsmoker?authSource=admin
```

## Security Notes

- Never commit actual passwords to version control
- Use GitHub Secrets for production credentials
- Use strong, unique passwords for each environment
- The application user has minimal permissions (readWrite only)
- Always use `--authenticationDatabase admin` when connecting with mongosh
