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

```bash
MONGO_INITDB_ROOT_USERNAME=admin
MONGO_INITDB_ROOT_PASSWORD=<secure-password>
MONGO_APP_PASSWORD=<secure-password>
```

## Security Notes

- Never commit actual passwords to version control
- Use GitHub Secrets for production credentials
- Use strong, unique passwords for each environment
- The application user has minimal permissions (readWrite only)
