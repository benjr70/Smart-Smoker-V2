# Authentication

## Overview

Authentication configuration for Smart Smoker V2 infrastructure, including MongoDB authentication, SSH keys, and access control.

## MongoDB Authentication

### Two-User Security Model

1. **Admin User** (`admin`) - Full database access
   - Created automatically by MongoDB from environment variables
   - Used for administrative tasks
   - Never used by application code

2. **Application User** (`smartsmoker`) - Limited readWrite access
   - Created by initialization script
   - Only has readWrite permissions on `smartsmoker` database
   - Used by backend application for all database operations

### User Creation

**Admin User**:
```bash
MONGO_INITDB_ROOT_USERNAME=admin
MONGO_INITDB_ROOT_PASSWORD=<secure-password>
```

**Application User** (`infra/mongodb-init/01-create-users.js`):
```javascript
db.createUser({
  user: 'smartsmoker',
  pwd: process.env.MONGO_APP_PASSWORD,
  roles: [{ role: 'readWrite', db: 'smartsmoker' }]
});
```

### Security Principles

- **Principle of Least Privilege**: Application user only has readWrite on smartsmoker database
- **No Root Access**: Backend never uses admin credentials
- **Authentication Required**: All connections must authenticate
- **Strong Passwords**: Base64-encoded 32-byte passwords (43 characters)

See [MongoDB Configuration](../database/mongodb.md) for details.

## SSH Authentication

### Key-Only Authentication

**Configuration**: Password authentication disabled, key-only access

**SSH Key Setup**:
```bash
# Generate SSH key pair
ssh-keygen -t ed25519 -C "your_email@example.com"

# Copy public key to server
ssh-copy-id user@host

# Or manually
cat ~/.ssh/id_ed25519.pub | ssh user@host "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys"
```

### SSH Key Management

**Current Status**: SSH public keys configured in Ansible inventory

**Best Practices**:
- Use 4096-bit RSA or Ed25519 keys
- Rotate SSH keys regularly
- Use different keys for different environments
- Store keys securely (password manager)

### SSH Configuration

**Hardened SSH Config**:
```
PasswordAuthentication no
PubkeyAuthentication yes
PermitRootLogin no
AuthorizedKeysFile .ssh/authorized_keys
```

See [System Setup](../configuration/system-setup.md) for details.

## Access Control

### User Management

**Container Users**:
- Root access for system administration
- Application users for service execution
- Limited permissions where possible

### Service Accounts

**MongoDB**:
- Admin user for database administration
- Application user for service access

**Docker**:
- Root access required for Docker operations
- Application users for container execution

## Password Management

### Password Generation

**MongoDB Passwords**:
```bash
# Generate secure password
openssl rand -base64 32

# URL-encode for connection strings
ENCODED_PASSWORD=$(printf %s "$PASSWORD" | jq -sRr @uri)
```

### Password Storage

**GitHub Secrets**: Store passwords securely in GitHub Secrets

**Local Development**: Use `.env` files (not committed to git)

**Production**: Environment variables from GitHub Secrets

See [Secrets Management](secrets-management.md) for details.

## Authentication Testing

### MongoDB Authentication

```bash
# Test admin authentication
docker exec mongo mongosh -u admin -p "${MONGO_ROOT_PASSWORD}" \
  --authenticationDatabase admin \
  --eval "db.adminCommand({listDatabases: 1})"

# Test application user
docker exec mongo mongosh -u smartsmoker -p "${MONGO_APP_PASSWORD}" \
  --authenticationDatabase admin smartsmoker \
  --eval "db.stats()"
```

### SSH Authentication

```bash
# Test SSH connection
ssh -v user@host

# Verify key authentication
ssh -o PreferredAuthentications=publickey user@host
```

## Troubleshooting

### MongoDB Authentication Failed

**Symptoms**: "Authentication failed" errors

**Solution**:
```bash
# Verify environment variables
docker exec mongo env | grep MONGO

# Test authentication manually
docker exec mongo mongosh -u admin -p "${MONGO_ROOT_PASSWORD}" \
  --authenticationDatabase admin

# Check user exists
docker exec mongo mongosh -u admin -p "${MONGO_ROOT_PASSWORD}" \
  --authenticationDatabase admin \
  --eval "db.getUsers()"
```

### SSH Key Not Working

**Symptoms**: Cannot connect via SSH

**Solution**:
```bash
# Check SSH service
systemctl status sshd

# Verify key permissions
chmod 600 ~/.ssh/authorized_keys
chmod 700 ~/.ssh

# Check SSH logs
journalctl -u sshd -n 50

# Test with verbose output
ssh -v user@host
```

## Related Documentation

- [MongoDB Configuration](../database/mongodb.md) - MongoDB authentication
- [Secrets Management](secrets-management.md) - Password management
- [System Setup](../configuration/system-setup.md) - SSH configuration

---

**Last Updated**: 2025-12-07



