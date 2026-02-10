# Monitoring

## Overview

Health monitoring, logging, and alerting for Smart Smoker V2 infrastructure.

## Health Monitoring

### Docker Health Checks

All services have Docker health checks configured:

- **MongoDB**: Ping check every 30s
- **Backend**: HTTP health endpoint check every 30s
- **Frontend**: HTTP check every 30s

See [Health Checks](../deployment/health-checks.md) for details.

### Health Endpoints

**Backend Health Endpoint**: `/api/health`

```bash
# Check backend health
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
```

### Container Health Status

```bash
# View health status
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Health}}"

# Filter healthy containers
docker ps --filter health=healthy

# Filter unhealthy containers
docker ps --filter health=unhealthy
```

## Logging

### Container Logs

```bash
# View backend logs
docker logs backend_cloud --tail 50 --follow

# View MongoDB logs
docker logs mongo --tail 50 --follow

# View all logs
docker compose -f cloud.docker-compose.yml logs -f --tail=100
```

### System Logs

```bash
# View system logs
journalctl -u docker -n 50

# View SSH logs
journalctl -u sshd -n 50

# View backup logs
tail -50 /var/log/mongodb-backup.log
```

### Log Management

**Log Rotation**: Configured via system logrotate

**Log Retention**: 7 days for application logs, 30 days for system logs

## Monitoring Tools

### Resource Monitoring

```bash
# Check CPU and memory
docker stats

# Check disk usage
df -h

# Check container resources
pct exec 104 -- top -bn1
```

### Service Monitoring

```bash
# Check service status
systemctl status docker
systemctl status tailscaled

# Check container status
docker ps -a
```

### Runner Health Monitoring

The GitHub Actions runner has a self-healing systemd timer that auto-detects and fixes stale registrations every 5 minutes.

```bash
# Check timer status
systemctl status runner-health-check.timer

# View recent health check logs
journalctl -u runner-health-check --since "1 hour ago"

# Manually trigger a health check
systemctl start runner-health-check.service

# Check runner service directly
systemctl status actions.runner.*
```

**What the health check monitors:**

- Runner `.runner` config file exists
- Runner systemd service is active
- No error loops in recent service logs (>3 errors in 5 min = unhealthy)

**What it does when unhealthy:**

- Checks DNS resolution for `api.github.com` (falls back to 8.8.8.8 if needed)
- Auto-generates a registration token from stored PAT
- Stops and uninstalls the stale runner service
- Re-registers with `--replace --unattended`
- Installs and starts the new service

## Alerting

### Health Check Alerts

Health check failures trigger:
- Automated rollback (in CI/CD)
- Log entries
- Deployment failure notifications

### Backup Alerts

Backup failures logged to:
- `/var/log/mongodb-backup.log`
- System logs

## Performance Monitoring

### Startup Time

**Before** (no health checks):
- Total startup: ~10 seconds

**After** (with health checks):
- Total startup: ~160 seconds

**Reason**: Health check start periods allow services to initialize properly.

### Runtime Performance

- **Health Checks**: Minimal CPU impact (~0.1% every 30s)
- **Health Endpoints**: Negligible impact on application performance

## Monitoring Best Practices

### Regular Checks

1. **Daily**: Review container health status
2. **Weekly**: Review logs for errors
3. **Monthly**: Review performance metrics

### Alert Configuration

1. **Health Checks**: Monitor container health status
2. **Backup Failures**: Alert on backup failures
3. **Disk Space**: Alert when disk usage > 90%
4. **Service Failures**: Alert on service crashes

## Related Documentation

- [Health Checks](../deployment/health-checks.md) - Health check configuration
- [Deployment Automation](../deployment/automation.md) - CI/CD monitoring
- [Disaster Recovery](disaster-recovery.md) - Recovery procedures

---

**Last Updated**: 2025-12-07



