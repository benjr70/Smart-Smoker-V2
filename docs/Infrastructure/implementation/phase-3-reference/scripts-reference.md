# Phase 3: Deployment Scripts Reference

Reference implementations for deployment scripts. Some of these exist in the codebase already, others are planned patterns for future use.

## Existing Scripts

### `scripts/deployment-health-check.sh`

Cloud deployment health check. Validates backend API, frontend, Docker container health, and disk usage. Used by `cloud-deploy.yml`.

### `scripts/device-health-check.sh`

Device health check. Validates device service (port 3003), frontend (port 8080), Docker containers (`device_service`, `frontend_smoker`, `watchtower`), Tailscale connectivity, cloud backend connectivity, and system resources. Used by `device-deploy.yml`.

### `scripts/validate-virtual-smoker.sh`

Infrastructure validation for the virtual smoker device. Checks SSH connectivity, CPU cores (expects 4), memory (~1GB), swap (~100MB), Docker version (expects 24.x), Tailscale hostname, directory structure, and Docker Compose availability.

## Reference Patterns

The following scripts are reference patterns from the original planning doc. They may be useful when implementing remaining stories.

### Cloud Health Check Pattern

```bash
#!/bin/bash
# scripts/health-check.sh

HOST=$1
if [ -z "$HOST" ]; then
    echo "Usage: $0 <hostname>"
    exit 1
fi

echo "Running health checks for $HOST..."

check_service() {
    local service=$1
    local port=$2
    local path=${3:-"/"}

    if curl -f -s --max-time 10 "http://${HOST}:${port}${path}" > /dev/null; then
        echo "OK: $service is healthy"
        return 0
    else
        echo "FAIL: $service is unhealthy"
        return 1
    fi
}

HEALTH_CHECKS=(
    "backend:3001:/health"
    "frontend:80:/"
    "device-service:3002:/health"
)

failed_checks=0

for check in "${HEALTH_CHECKS[@]}"; do
    IFS=':' read -r service port path <<< "$check"
    if ! check_service "$service" "$port" "$path"; then
        failed_checks=$((failed_checks + 1))
    fi
    sleep 2
done

container_status=$(ssh root@${HOST} "docker-compose ps --services --filter 'status=running'" 2>/dev/null | wc -l)
expected_containers=4

if [ "$container_status" -ge "$expected_containers" ]; then
    echo "OK: All containers are running"
else
    echo "FAIL: Some containers are not running (expected: $expected_containers, running: $container_status)"
    failed_checks=$((failed_checks + 1))
fi

memory_usage=$(ssh root@${HOST} "free | grep Mem | awk '{printf \"%.1f\", \$3/\$2 * 100.0}'")
disk_usage=$(ssh root@${HOST} "df / | tail -1 | awk '{print \$5}' | sed 's/%//'")

echo "Memory usage: ${memory_usage}%"
echo "Disk usage: ${disk_usage}%"

if [ $failed_checks -eq 0 ]; then
    echo "All health checks passed for $HOST"
    exit 0
else
    echo "$failed_checks health check(s) failed for $HOST"
    exit 1
fi
```

### Raspberry Pi Device Update Pattern

```bash
#!/bin/bash
# scripts/update-single-device.sh

DEVICE=$1
if [ -z "$DEVICE" ]; then
    echo "Usage: $0 <device-hostname>"
    exit 1
fi

echo "Updating Raspberry Pi device: $DEVICE"

# Pre-update health check
if ! ./scripts/health-check-device.sh "$DEVICE"; then
    echo "WARNING: Device $DEVICE is not healthy before update, proceeding anyway..."
fi

# Backup current state
ssh pi@$DEVICE "docker-compose ps > /tmp/pre-update-status.txt"

# Trigger Watchtower one-shot update
ssh pi@$DEVICE "docker run --rm -v /var/run/docker.sock:/var/run/docker.sock containrrr/watchtower --run-once --cleanup"

sleep 60

# Verify services restarted
max_attempts=10
attempt=0

while [ $attempt -lt $max_attempts ]; do
    if ssh pi@$DEVICE "docker-compose ps | grep -q 'Up'"; then
        echo "Services are running"
        break
    fi
    echo "Waiting for services to start (attempt $((attempt + 1))/$max_attempts)..."
    sleep 30
    attempt=$((attempt + 1))
done

if [ $attempt -eq $max_attempts ]; then
    echo "Services failed to start after update"
    ssh pi@$DEVICE "cd /opt/smart-smoker && docker-compose down && docker-compose up -d"
    sleep 30
    if ! ssh pi@$DEVICE "docker-compose ps | grep -q 'Up'"; then
        echo "Recovery failed for device $DEVICE"
        exit 1
    fi
fi

# Post-update verification
if ./scripts/health-check-device.sh "$DEVICE"; then
    echo "Device $DEVICE updated successfully"
else
    echo "Device $DEVICE failed post-update health check"
    exit 1
fi
```

### Integration Test Pattern (Story 7)

```bash
#!/bin/bash
# scripts/run-integration-tests.sh

VIRTUAL_DEVICE=$1
if [ -z "$VIRTUAL_DEVICE" ]; then
    echo "Usage: $0 <virtual-device-hostname>"
    exit 1
fi

echo "Running integration tests on virtual device: $VIRTUAL_DEVICE"

# Test 1: Device Service Connectivity
echo "Test 1: Device Service Connectivity"
if curl -f -s --max-time 10 "http://${VIRTUAL_DEVICE}:3002/health" > /dev/null; then
    echo "PASS: Device service is reachable"
else
    echo "FAIL: Device service connectivity test failed"
    exit 1
fi

# Test 2: Mock Hardware Integration
echo "Test 2: Mock Hardware Integration"
temp_response=$(curl -s "http://${VIRTUAL_DEVICE}:5000/temperature/28-000000000001")
if echo "$temp_response" | jq -e '.temperature' > /dev/null 2>&1; then
    echo "PASS: Mock temperature sensor responding"
else
    echo "FAIL: Mock hardware integration test failed"
    exit 1
fi

# Test 3: WebSocket Communication
echo "Test 3: WebSocket Communication"
cat > /tmp/websocket-test.js << 'WSEOF'
const WebSocket = require('ws');

const ws = new WebSocket('ws://VIRTUAL_DEVICE:8765');

ws.on('open', function open() {
    ws.send(JSON.stringify({ type: 'test', message: 'integration test' }));
});

ws.on('message', function message(data) {
    const response = JSON.parse(data);
    if (response.type === 'command_ack') {
        console.log('PASS: WebSocket communication test passed');
        process.exit(0);
    }
});

ws.on('error', function error(err) {
    console.log('FAIL: WebSocket test failed:', err.message);
    process.exit(1);
});

setTimeout(() => {
    console.log('FAIL: WebSocket test timeout');
    process.exit(1);
}, 10000);
WSEOF

sed -i "s/VIRTUAL_DEVICE/${VIRTUAL_DEVICE}/g" /tmp/websocket-test.js
if ssh pi@$VIRTUAL_DEVICE "cd /tmp && node /tmp/websocket-test.js"; then
    echo "PASS: WebSocket communication test passed"
else
    echo "FAIL: WebSocket communication test failed"
    exit 1
fi

# Test 4: End-to-End Smoke Test
echo "Test 4: End-to-End Smoke Test"
curl -X POST "http://${VIRTUAL_DEVICE}:5000/temperature/28-000000000001/target/250"
sleep 5
new_temp=$(curl -s "http://${VIRTUAL_DEVICE}:5000/temperature/28-000000000001" | jq -r '.temperature')

if (( $(echo "$new_temp > 230" | bc -l) )); then
    echo "PASS: End-to-end smoke test passed (temp: $new_temp)"
else
    echo "FAIL: End-to-end smoke test failed (temp: $new_temp)"
    exit 1
fi

echo "All integration tests passed on $VIRTUAL_DEVICE"
```
