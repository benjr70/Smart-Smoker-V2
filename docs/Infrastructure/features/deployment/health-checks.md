# Docker Health Checks

## Overview

Docker health checks ensure all services are running correctly and dependencies are available before dependent services start. This prevents bad deployments and enables automatic recovery.

## Health Check Configuration

### MongoDB Health Check

**Configuration** (`cloud.docker-compose.yml`):

```yaml
mongo:
  healthcheck:
    test: ["CMD", "mongosh", "--eval", "db.adminCommand('ping')"]
    interval: 30s
    timeout: 10s
    retries: 3
    start_period: 60s
```

**What It Does**: Pings MongoDB to verify it's accepting connections.

### Backend Health Check

**Configuration** (`cloud.docker-compose.yml`):

```yaml
backend:
  healthcheck:
    test: ["CMD", "node", "/apps/backend/healthcheck.js"]
    interval: 30s
    timeout: 10s
    retries: 3
    start_period: 60s
```

**Health Check Script** (`apps/backend/healthcheck.js`):

```javascript
const http = require('http');

const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/api/health',
  method: 'GET',
  timeout: 5000
};

const req = http.request(options, (res) => {
  if (res.statusCode === 200) {
    process.exit(0);
  } else {
    console.error(`Health check failed with status code: ${res.statusCode}`);
    process.exit(1);
  }
});

req.on('error', (err) => {
  console.error(`Health check failed: ${err.message}`);
  process.exit(1);
});

req.on('timeout', () => {
  console.error('Health check timeout');
  req.destroy();
  process.exit(1);
});

req.end();
```

**Health Endpoint** (`apps/backend/src/health/health.controller.ts`):

```typescript
@Controller('api/health')
export class HealthController {
  constructor(@InjectConnection() private connection: Connection) {}

  @Get()
  async check() {
    const dbStatus =
      this.connection.readyState === 1 ? 'connected' : 'disconnected';

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: {
        status: dbStatus,
        name: this.connection.name,
      },
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'production',
    };
  }
}
```

### Frontend Health Check

**Configuration** (`cloud.docker-compose.yml`):

```yaml
frontend:
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:3000"]
    interval: 30s
    timeout: 10s
    retries: 3
    start_period: 40s
```

**What It Does**: Verifies frontend HTTP server is responding.

## Cascading Dependencies

Health checks enable cascading service dependencies:

```yaml
backend:
  depends_on:
    mongo:
      condition: service_healthy  # Backend waits for healthy MongoDB

frontend:
  depends_on:
    backend:
      condition: service_healthy  # Frontend waits for healthy backend
```

**Flow**:
1. MongoDB starts and becomes healthy (60s start period)
2. Backend starts only after MongoDB is healthy
3. Backend becomes healthy (60s start period)
4. Frontend starts only after backend is healthy
5. Frontend becomes healthy (40s start period)

## Health Check States

- **`starting`** - Container starting, health checks haven't passed yet
- **`healthy`** - All health checks passing
- **`unhealthy`** - Health checks failing

## Benefits

- **Prevents Bad Deployments**: Services won't start if dependencies aren't healthy
- **Automatic Recovery**: Docker can restart unhealthy containers
- **Monitoring Integration**: Health status visible via `docker ps`
- **Deployment Verification**: CI/CD can verify health before declaring success

## Monitoring Health Status

### Check Container Health

```bash
# View health status of all containers
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Health}}"

# Filter healthy containers
docker ps --filter health=healthy

# Filter unhealthy containers
docker ps --filter health=unhealthy

# Check specific container health
docker inspect --format='{{.State.Health.Status}}' mongo
docker inspect --format='{{.State.Health.Status}}' backend_cloud
docker inspect --format='{{.State.Health.Status}}' frontend_cloud
```

### View Health Check Logs

```bash
# View health check history
docker inspect --format='{{json .State.Health}}' backend_cloud | jq

# View recent health check attempts
docker inspect --format='{{range .State.Health.Log}}{{.Output}}{{end}}' backend_cloud
```

### Watch Health Status

```bash
# Monitor health status continuously
watch -n 5 'docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Health}}"'
```

## Testing Health Checks

### Test Health Endpoints

```bash
# Test backend health endpoint
curl http://localhost:8443/api/health | jq

# Expected response:
# {
#   "status": "ok",
#   "timestamp": "2025-12-07T14:30:00.000Z",
#   "database": {
#     "status": "connected",
#     "name": "smartsmoker"
#   },
#   "uptime": 3600,
#   "environment": "production"
# }

# Test frontend
curl -I http://localhost:80
# Expected: HTTP/1.1 200 OK
```

### Verify Health Check Scripts

```bash
# Test backend health check script
docker exec backend_cloud node /apps/backend/healthcheck.js
# Exit code 0 = healthy, 1 = unhealthy

# Test MongoDB health check
docker exec mongo mongosh --eval "db.adminCommand('ping')"
# Should return: { ok: 1 }
```

## Troubleshooting

### Health Checks Failing

**Symptoms**: Containers marked as unhealthy

**Solution**:
```bash
# Check health check logs
docker inspect backend_cloud --format='{{json .State.Health}}' | jq

# Look at recent health check attempts
docker inspect backend_cloud --format='{{range .State.Health.Log}}{{.Output}}{{end}}'

# Common issues:
# 1. Service not fully started yet (wait 60-120s)
# 2. Health endpoint not accessible (check port mapping)
# 3. Dependencies not healthy (check mongo health first)
```

### Service Not Starting

**Symptoms**: Container stays in "starting" state

**Solution**:
```bash
# Check if dependency is healthy
docker ps --filter health=healthy

# Check dependency logs
docker logs mongo --tail 50

# Increase start_period if service needs more time
# Edit cloud.docker-compose.yml and increase start_period value
```

### Health Endpoint Not Responding

**Symptoms**: Backend health check fails

**Solution**:
```bash
# Check if backend is running
docker ps | grep backend

# Check backend logs
docker logs backend_cloud --tail 50

# Test health endpoint manually
curl http://localhost:8443/api/health

# Check port mapping
docker port backend_cloud
```

## Performance Impact

### Startup Time

**Before** (no health checks):
- MongoDB ready: ~5 seconds
- Backend ready: ~10 seconds
- Total startup: ~10 seconds

**After** (with health checks):
- MongoDB ready: ~60 seconds (start_period)
- Backend ready: ~60 seconds (waiting for healthy mongo)
- Frontend ready: ~40 seconds (waiting for healthy backend)
- Total startup: ~160 seconds

**Reason**: Health check start periods allow services to initialize properly before being marked healthy.

### Runtime Performance

- **Health Checks**: Minimal CPU impact (~0.1% every 30s)
- **Health Endpoints**: Negligible impact on application performance

## Integration with CI/CD

### GitHub Actions Health Verification

The deployment workflow includes health checks:

```yaml
# Wait for services to start (health checks have start_period of 60s)
- name: Wait for startup
  run: sleep 60

# Health check with retry (3x per user preference)
- name: Verify deployment health
  id: health_check
  run: |
    if ! ./scripts/deployment-health-check.sh localhost 3; then
      echo "Health check failed after 3 retries"
      exit 1
    fi
```

See [Deployment Automation](automation.md) for full CI/CD integration.

## Related Documentation

- [Deployment Automation](automation.md) - CI/CD workflows with health checks
- [Deployment Rollback](rollback.md) - Rollback on health check failure
- [MongoDB Configuration](../database/mongodb.md) - MongoDB health check setup
- [Monitoring](../operations/monitoring.md) - Health monitoring and alerts

---

**Last Updated**: 2025-12-07



