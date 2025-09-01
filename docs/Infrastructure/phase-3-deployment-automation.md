# Phase 3: Deployment Automation

## Overview

Phase 3 implements automated deployment workflows using GitHub Actions with the self-hosted runner infrastructure established in Phase 2. This phase focuses on creating robust CI/CD pipelines for both cloud environments and Raspberry Pi devices, integrating the new container naming convention and Tailscale networking.

## Goals & Objectives

### Primary Goals
- **Automated CI/CD**: Implement GitHub Actions workflows for all deployment targets
- **Multi-Environment Deployment**: Support dev, staging, and production environments
- **Raspberry Pi Integration**: Automated deployment to physical devices
- **Security & Reliability**: Secure deployment processes with rollback capabilities
- **Monitoring & Alerting**: Real-time deployment status and failure notifications

### Success Criteria
- ✅ Automated deployment to dev environment on master merge
- ✅ Manual production deployment with approval gates
- ✅ Raspberry Pi deployment automation working
- ✅ Container registry integration functional
- ✅ Deployment rollback mechanisms in place
- ✅ Comprehensive monitoring and alerting

## Architecture Components

### Deployment Pipeline Overview
```
GitHub Repository
├── Feature Branch Push
│   ├── Lint & Test (GitHub Hosted)
│   ├── Build Docker Images (GitHub Hosted)
│   └── Push to Development Registry
│
├── Master Branch Merge
│   ├── Run Full Test Suite (Self-hosted Runner)
│   ├── Build Production Images (Self-hosted Runner)
│   ├── Deploy to Dev Cloud (Proxmox LXC)
│   ├── Integration Tests (Virtual Smoker VM)
│   └── Tag Release Candidate
│
├── Production Release
│   ├── Manual Approval Required
│   ├── Deploy to Production Cloud (Proxmox LXC)
│   ├── Update Raspberry Pi Devices
│   ├── Verify Deployment Health
│   └── Send Notifications
│
└── Rollback Process
    ├── Detect Deployment Issues
    ├── Automatic/Manual Rollback
    ├── Restore Previous Version
    └── Alert Team
```

### Deployment Targets
```
Deployment Infrastructure
├── Cloud Environments (Proxmox)
│   ├── Development (smoker-dev-cloud)
│   │   ├── Auto-deploy on master merge
│   │   ├── Latest container images
│   │   ├── Integration testing
│   │   └── Tailscale internal access
│   │
│   └── Production (smokecloud)
│       ├── Manual deployment approval
│       ├── Tagged stable releases
│       ├── Health monitoring
│       ├── Tailscale funnel (public access)
│       └── Automated backups
│
├── Physical Devices (Raspberry Pi)
│   ├── Production Smokers
│   │   ├── Watchtower auto-updates
│   │   ├── Standardized container names
│   │   ├── Health monitoring
│   │   └── Remote management via Tailscale
│   │
│   └── Development Devices
│       ├── Beta testing releases
│       ├── Manual update triggers
│       └── Development branch deployments
│
└── Virtual Testing (Proxmox VM)
    ├── Integration test execution
    ├── Mock hardware validation
    ├── Performance testing
    └── User acceptance testing
```

## User Stories

### Story 1: Automated Development Deployment
**As a** developer  
**I want** my code automatically deployed to dev when merged to master  
**So that** I can quickly test integration changes

**Acceptance Criteria:**
- Master merge triggers automatic deployment
- Dev environment updated within 10 minutes
- Integration tests run against new deployment
- Slack notification sent on success/failure
- Rollback triggered on health check failure

### Story 2: Controlled Production Deployment
**As a** product owner  
**I want** manual control over production deployments  
**So that** releases are coordinated and verified

**Acceptance Criteria:**
- Production deployment requires manual approval
- Approval workflow with multiple reviewers
- Pre-deployment health checks
- Automated rollback on failure
- Deployment status dashboard

### Story 3: Raspberry Pi Device Management
**As a** system administrator  
**I want** automated updates to Raspberry Pi devices  
**So that** all smokers run consistent software versions

**Acceptance Criteria:**
- Watchtower automatically pulls new images
- Standardized container naming works
- Device health monitoring active
- Remote troubleshooting capabilities
- Update rollback on device failure

### Story 4: Virtual Device Testing
**As a** QA engineer  
**I want** automated testing on virtual devices  
**So that** device functionality is validated before release

**Acceptance Criteria:**
- Virtual smoker VM tests run automatically
- Mock hardware integration testing
- Device service validation
- Performance benchmarking
- Test results integrated in pipeline

## GitHub Actions Workflows

### Development Workflow
```yaml
# .github/workflows/development.yml
name: Development CI/CD

on:
  push:
    branches: [ master ]
  pull_request:
    branches: [ master ]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run linting
        run: npm run lint
      
      - name: Run tests
        run: npm run test:ci
      
      - name: Build applications
        run: npm run build

  build-images:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/master'
    
    strategy:
      matrix:
        service: [backend, frontend, device-service, smoker]
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3
      
      - name: Login to Docker Hub
        uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}
      
      - name: Build and push development image
        uses: docker/build-push-action@v5
        with:
          context: ./apps/${{ matrix.service }}
          push: true
          tags: |
            benjr70/smart-smoker-${{ matrix.service }}:dev-latest
            benjr70/smart-smoker-${{ matrix.service }}:dev-${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  deploy-dev:
    needs: [test, build-images]
    runs-on: self-hosted
    if: github.ref == 'refs/heads/master'
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Deploy to development environment
        run: |
          # Connect to dev environment via Tailscale
          export DEV_HOST="smoker-dev-cloud"
          
          # Update docker-compose with new images
          sed -i 's/:latest/:dev-latest/g' cloud.docker-compose.yml
          
          # Deploy to development environment
          scp cloud.docker-compose.yml root@${DEV_HOST}:/opt/smart-smoker/
          ssh root@${DEV_HOST} "cd /opt/smart-smoker && docker-compose pull && docker-compose up -d"
          
          # Wait for services to be healthy
          sleep 30
          
          # Run health checks
          ./scripts/health-check.sh ${DEV_HOST}
      
      - name: Run integration tests
        run: |
          export VIRTUAL_SMOKER_HOST="virtual-smoker-device"
          ./scripts/run-integration-tests.sh ${VIRTUAL_SMOKER_HOST}
      
      - name: Notify deployment status
        uses: 8398a7/action-slack@v3
        with:
          status: ${{ job.status }}
          channel: '#deployments'
          webhook_url: ${{ secrets.SLACK_WEBHOOK }}
        if: always()
```

### Production Workflow
```yaml
# .github/workflows/production.yml
name: Production Deployment

on:
  workflow_dispatch:
    inputs:
      version:
        description: 'Version to deploy'
        required: true
        type: string
      environment:
        description: 'Target environment'
        required: true
        default: 'production'
        type: choice
        options:
        - production
        - staging

jobs:
  approval:
    runs-on: ubuntu-latest
    environment: 
      name: ${{ github.event.inputs.environment }}
      url: https://smokecloud.tail74646.ts.net
    steps:
      - name: Manual approval checkpoint
        run: echo "Deployment approved for ${{ github.event.inputs.environment }}"

  build-production:
    needs: approval
    runs-on: self-hosted
    
    strategy:
      matrix:
        service: [backend, frontend, device-service, smoker]
    
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.event.inputs.version }}
      
      - name: Build production images
        run: |
          cd apps/${{ matrix.service }}
          docker build -t benjr70/smart-smoker-${{ matrix.service }}:${{ github.event.inputs.version }} .
          docker build -t benjr70/smart-smoker-${{ matrix.service }}:latest .
      
      - name: Push production images
        run: |
          docker push benjr70/smart-smoker-${{ matrix.service }}:${{ github.event.inputs.version }}
          docker push benjr70/smart-smoker-${{ matrix.service }}:latest

  deploy-cloud:
    needs: build-production
    runs-on: self-hosted
    
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.event.inputs.version }}
      
      - name: Backup current deployment
        run: |
          export PROD_HOST="smokecloud"
          ssh root@${PROD_HOST} "cd /opt/smart-smoker && cp cloud.docker-compose.yml cloud.docker-compose.yml.backup"
          ssh root@${PROD_HOST} "cd /opt/smart-smoker && docker-compose ps > deployment.backup"
      
      - name: Deploy to production cloud
        run: |
          export PROD_HOST="smokecloud"
          
          # Update compose file with new version
          sed -i "s/:latest/:${{ github.event.inputs.version }}/g" cloud.docker-compose.yml
          
          # Deploy new version
          scp cloud.docker-compose.yml root@${PROD_HOST}:/opt/smart-smoker/
          ssh root@${PROD_HOST} "cd /opt/smart-smoker && docker-compose pull"
          ssh root@${PROD_HOST} "cd /opt/smart-smoker && docker-compose up -d"
          
          # Wait for deployment
          sleep 60
      
      - name: Verify deployment health
        run: |
          export PROD_HOST="smokecloud"
          
          # Run comprehensive health checks
          ./scripts/health-check.sh ${PROD_HOST}
          ./scripts/performance-test.sh ${PROD_HOST}
          
          # Check Tailscale funnel status
          ssh root@${PROD_HOST} "tailscale funnel status"
      
      - name: Update Raspberry Pi devices
        run: |
          # Trigger Watchtower updates on all Pi devices
          ./scripts/update-raspberry-pi-devices.sh ${{ github.event.inputs.version }}
      
      - name: Tag successful deployment
        run: |
          git tag -a "prod-${{ github.event.inputs.version }}-$(date +%Y%m%d-%H%M%S)" -m "Production deployment ${{ github.event.inputs.version }}"
          git push origin --tags

  rollback:
    needs: deploy-cloud
    runs-on: self-hosted
    if: failure()
    
    steps:
      - name: Rollback deployment
        run: |
          export PROD_HOST="smokecloud"
          
          echo "Deployment failed, initiating rollback..."
          
          # Restore previous deployment
          ssh root@${PROD_HOST} "cd /opt/smart-smoker && cp cloud.docker-compose.yml.backup cloud.docker-compose.yml"
          ssh root@${PROD_HOST} "cd /opt/smart-smoker && docker-compose up -d"
          
          # Verify rollback
          sleep 30
          ./scripts/health-check.sh ${PROD_HOST}
      
      - name: Notify rollback
        uses: 8398a7/action-slack@v3
        with:
          status: custom
          custom_payload: |
            {
              text: "🚨 Production deployment failed and was rolled back",
              channel: "#alerts",
              username: "Deployment Bot",
              icon_emoji: ":warning:"
            }
          webhook_url: ${{ secrets.SLACK_WEBHOOK }}
```

### Raspberry Pi Update Workflow
```yaml
# .github/workflows/raspberry-pi-update.yml
name: Raspberry Pi Device Updates

on:
  workflow_dispatch:
    inputs:
      target_devices:
        description: 'Target devices (all, production, development)'
        required: true
        default: 'production'
        type: choice
        options:
        - all
        - production
        - development
      update_strategy:
        description: 'Update strategy'
        required: true
        default: 'rolling'
        type: choice
        options:
        - rolling
        - immediate
        - scheduled

jobs:
  update-devices:
    runs-on: self-hosted
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Discover Raspberry Pi devices
        run: |
          # Use Tailscale to discover Pi devices
          tailscale status --json | jq -r '.Peer[] | select(.HostName | contains("smoker-pi")) | .HostName' > pi-devices.txt
          
          # Filter based on target
          case "${{ github.event.inputs.target_devices }}" in
            "production")
              grep "smoker-pi-prod" pi-devices.txt > target-devices.txt || true
              ;;
            "development") 
              grep "smoker-pi-dev" pi-devices.txt > target-devices.txt || true
              ;;
            "all")
              cp pi-devices.txt target-devices.txt
              ;;
          esac
          
          echo "Target devices:"
          cat target-devices.txt
      
      - name: Update devices
        run: |
          update_strategy="${{ github.event.inputs.update_strategy }}"
          
          while IFS= read -r device; do
            echo "Updating device: $device"
            
            case "$update_strategy" in
              "rolling")
                # Update one device at a time with health checks
                ./scripts/update-single-device.sh "$device"
                ./scripts/health-check-device.sh "$device"
                sleep 120  # Wait between devices
                ;;
              "immediate")
                # Update all devices simultaneously
                ./scripts/update-single-device.sh "$device" &
                ;;
              "scheduled")
                # Schedule update for maintenance window
                ssh pi@$device "echo 'watchtower --run-once --cleanup' | at 02:00"
                ;;
            esac
            
          done < target-devices.txt
          
          # Wait for immediate updates to complete
          if [ "$update_strategy" = "immediate" ]; then
            wait
          fi
      
      - name: Verify device updates
        run: |
          failed_devices=""
          
          while IFS= read -r device; do
            echo "Verifying device: $device"
            
            if ! ./scripts/health-check-device.sh "$device"; then
              failed_devices="$failed_devices $device"
              echo "❌ Device $device failed health check"
            else
              echo "✅ Device $device updated successfully"
            fi
            
          done < target-devices.txt
          
          if [ -n "$failed_devices" ]; then
            echo "Failed devices: $failed_devices"
            exit 1
          fi
      
      - name: Update monitoring dashboard
        run: |
          # Update device status in monitoring system
          ./scripts/update-device-dashboard.sh
```

## Deployment Scripts

### Health Check Script
```bash
#!/bin/bash
# scripts/health-check.sh

HOST=$1
if [ -z "$HOST" ]; then
    echo "Usage: $0 <hostname>"
    exit 1
fi

echo "Running health checks for $HOST..."

# Check if services are running
check_service() {
    local service=$1
    local port=$2
    local path=${3:-"/"}
    
    echo "Checking $service on port $port..."
    
    if curl -f -s --max-time 10 "http://${HOST}:${port}${path}" > /dev/null; then
        echo "✅ $service is healthy"
        return 0
    else
        echo "❌ $service is unhealthy"
        return 1
    fi
}

# Service health checks
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

# Check Docker containers
echo "Checking Docker container status..."
container_status=$(ssh root@${HOST} "docker-compose ps --services --filter 'status=running'" 2>/dev/null | wc -l)
expected_containers=4  # backend, frontend, device-service, database

if [ "$container_status" -ge "$expected_containers" ]; then
    echo "✅ All containers are running"
else
    echo "❌ Some containers are not running (expected: $expected_containers, running: $container_status)"
    failed_checks=$((failed_checks + 1))
fi

# Check system resources
echo "Checking system resources..."
memory_usage=$(ssh root@${HOST} "free | grep Mem | awk '{printf \"%.1f\", \$3/\$2 * 100.0}'")
disk_usage=$(ssh root@${HOST} "df / | tail -1 | awk '{print \$5}' | sed 's/%//'")

if (( $(echo "$memory_usage < 90" | bc -l) )); then
    echo "✅ Memory usage: ${memory_usage}%"
else
    echo "⚠️  High memory usage: ${memory_usage}%"
fi

if [ "$disk_usage" -lt 90 ]; then
    echo "✅ Disk usage: ${disk_usage}%"
else
    echo "⚠️  High disk usage: ${disk_usage}%"
fi

# Final result
if [ $failed_checks -eq 0 ]; then
    echo "🎉 All health checks passed for $HOST"
    exit 0
else
    echo "💥 $failed_checks health check(s) failed for $HOST"
    exit 1
fi
```

### Raspberry Pi Device Update Script
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
echo "Running pre-update health check..."
if ! ./scripts/health-check-device.sh "$DEVICE"; then
    echo "⚠️  Device $DEVICE is not healthy before update, proceeding anyway..."
fi

# Backup current state
echo "Creating device backup..."
ssh pi@$DEVICE "docker-compose ps > /tmp/pre-update-status.txt"
ssh pi@$DEVICE "sudo systemctl is-active --quiet watchtower && echo 'watchtower active' || echo 'watchtower inactive'" > /tmp/watchtower-status.txt

# Update container images
echo "Triggering container updates..."
ssh pi@$DEVICE "docker run --rm -v /var/run/docker.sock:/var/run/docker.sock containrrr/watchtower --run-once --cleanup"

# Wait for updates to complete
echo "Waiting for updates to complete..."
sleep 60

# Verify services restarted properly
echo "Verifying service restart..."
max_attempts=10
attempt=0

while [ $attempt -lt $max_attempts ]; do
    if ssh pi@$DEVICE "docker-compose ps | grep -q 'Up'"; then
        echo "✅ Services are running"
        break
    else
        echo "⏳ Waiting for services to start (attempt $((attempt + 1))/$max_attempts)..."
        sleep 30
        attempt=$((attempt + 1))
    fi
done

if [ $attempt -eq $max_attempts ]; then
    echo "❌ Services failed to start after update"
    
    # Attempt recovery
    echo "Attempting service recovery..."
    ssh pi@$DEVICE "cd /opt/smart-smoker && docker-compose down && docker-compose up -d"
    sleep 30
    
    if ! ssh pi@$DEVICE "docker-compose ps | grep -q 'Up'"; then
        echo "💥 Recovery failed for device $DEVICE"
        exit 1
    fi
fi

# Post-update verification
echo "Running post-update health check..."
if ./scripts/health-check-device.sh "$DEVICE"; then
    echo "🎉 Device $DEVICE updated successfully"
    
    # Log successful update
    echo "$(date): Successfully updated $DEVICE" >> /tmp/device-updates.log
else
    echo "💥 Device $DEVICE failed post-update health check"
    exit 1
fi
```

### Integration Test Script
```bash
#!/bin/bash
# scripts/run-integration-tests.sh

VIRTUAL_DEVICE=$1
if [ -z "$VIRTUAL_DEVICE" ]; then
    echo "Usage: $0 <virtual-device-hostname>"
    exit 1
fi

echo "Running integration tests on virtual device: $VIRTUAL_DEVICE"

# Start test suite
echo "Starting integration test suite..."

# Test 1: Device Service Connectivity
echo "Test 1: Device Service Connectivity"
if curl -f -s --max-time 10 "http://${VIRTUAL_DEVICE}:3002/health" > /dev/null; then
    echo "✅ Device service is reachable"
else
    echo "❌ Device service connectivity test failed"
    exit 1
fi

# Test 2: Mock Hardware Integration
echo "Test 2: Mock Hardware Integration"
temp_response=$(curl -s "http://${VIRTUAL_DEVICE}:5000/temperature/28-000000000001")
if echo "$temp_response" | jq -e '.temperature' > /dev/null 2>&1; then
    echo "✅ Mock temperature sensor responding"
else
    echo "❌ Mock hardware integration test failed"
    exit 1
fi

# Test 3: WebSocket Communication
echo "Test 3: WebSocket Communication"
# Use a simple Node.js script to test WebSocket
cat > /tmp/websocket-test.js << 'EOF'
const WebSocket = require('ws');

const ws = new WebSocket('ws://VIRTUAL_DEVICE:8765');

ws.on('open', function open() {
    console.log('WebSocket connection established');
    ws.send(JSON.stringify({ type: 'test', message: 'integration test' }));
});

ws.on('message', function message(data) {
    const response = JSON.parse(data);
    if (response.type === 'command_ack') {
        console.log('✅ WebSocket communication test passed');
        process.exit(0);
    }
});

ws.on('error', function error(err) {
    console.log('❌ WebSocket test failed:', err.message);
    process.exit(1);
});

setTimeout(() => {
    console.log('❌ WebSocket test timeout');
    process.exit(1);
}, 10000);
EOF

# Replace placeholder and run test
sed -i "s/VIRTUAL_DEVICE/${VIRTUAL_DEVICE}/g" /tmp/websocket-test.js
if ssh pi@$VIRTUAL_DEVICE "cd /tmp && node /tmp/websocket-test.js"; then
    echo "✅ WebSocket communication test passed"
else
    echo "❌ WebSocket communication test failed"
    exit 1
fi

# Test 4: End-to-End Smoke Test
echo "Test 4: End-to-End Smoke Test"
# Set target temperature and verify response
curl -X POST "http://${VIRTUAL_DEVICE}:5000/temperature/28-000000000001/target/250"
sleep 5
new_temp=$(curl -s "http://${VIRTUAL_DEVICE}:5000/temperature/28-000000000001" | jq -r '.temperature')

if (( $(echo "$new_temp > 230" | bc -l) )); then
    echo "✅ End-to-end smoke test passed (temp: $new_temp)"
else
    echo "❌ End-to-end smoke test failed (temp: $new_temp)"
    exit 1
fi

echo "🎉 All integration tests passed on $VIRTUAL_DEVICE"
```

## Monitoring & Alerting

### Deployment Monitoring Dashboard
```yaml
# monitoring/deployment-dashboard.yml
apiVersion: v1
kind: ConfigMap
metadata:
  name: deployment-dashboard
data:
  dashboard.json: |
    {
      "dashboard": {
        "title": "Smart Smoker Deployments",
        "panels": [
          {
            "title": "Deployment Status",
            "type": "stat",
            "targets": [
              {
                "expr": "github_actions_workflow_runs_total{repository=\"Smart-Smoker-V2\",workflow=\"Production Deployment\",conclusion=\"success\"}",
                "legendFormat": "Successful Deployments"
              }
            ]
          },
          {
            "title": "Environment Health",
            "type": "table",
            "targets": [
              {
                "expr": "up{job=\"smart-smoker-health\"}",
                "legendFormat": "{{instance}}"
              }
            ]
          },
          {
            "title": "Raspberry Pi Devices",
            "type": "table", 
            "targets": [
              {
                "expr": "tailscale_device_status{device_type=\"raspberry-pi\"}",
                "legendFormat": "{{hostname}}"
              }
            ]
          }
        ]
      }
    }
```

### Slack Notification Templates
```yaml
# monitoring/slack-notifications.yml
deployment_success: |
  {
    "channel": "#deployments",
    "username": "Deployment Bot",
    "icon_emoji": ":rocket:",
    "attachments": [
      {
        "color": "good",
        "title": "🚀 Deployment Successful",
        "fields": [
          {
            "title": "Environment",
            "value": "{{ .environment }}",
            "short": true
          },
          {
            "title": "Version", 
            "value": "{{ .version }}",
            "short": true
          },
          {
            "title": "Duration",
            "value": "{{ .duration }}",
            "short": true
          },
          {
            "title": "Services",
            "value": "{{ .services }}",
            "short": true
          }
        ],
        "actions": [
          {
            "type": "button",
            "text": "View Logs",
            "url": "{{ .logs_url }}"
          },
          {
            "type": "button", 
            "text": "Environment",
            "url": "{{ .environment_url }}"
          }
        ]
      }
    ]
  }

deployment_failure: |
  {
    "channel": "#alerts",
    "username": "Deployment Bot", 
    "icon_emoji": ":warning:",
    "attachments": [
      {
        "color": "danger",
        "title": "💥 Deployment Failed",
        "fields": [
          {
            "title": "Environment",
            "value": "{{ .environment }}",
            "short": true
          },
          {
            "title": "Version",
            "value": "{{ .version }}",
            "short": true
          },
          {
            "title": "Failed Step",
            "value": "{{ .failed_step }}",
            "short": true
          },
          {
            "title": "Error",
            "value": "{{ .error_message }}",
            "short": false
          }
        ],
        "actions": [
          {
            "type": "button",
            "text": "View Logs",
            "url": "{{ .logs_url }}"
          },
          {
            "type": "button",
            "text": "Rollback",
            "url": "{{ .rollback_url }}"
          }
        ]
      }
    ]
  }
```

## Security & Compliance

### Deployment Security Checklist
- [ ] **Image Scanning**: All container images scanned for vulnerabilities
- [ ] **Secret Management**: Secrets stored in GitHub Secrets, not in code
- [ ] **Access Control**: Deployment approvals required for production
- [ ] **Audit Logging**: All deployment activities logged and monitored
- [ ] **Network Security**: Tailscale provides encrypted communication
- [ ] **Backup Verification**: Automated backups before each deployment
- [ ] **Rollback Testing**: Rollback procedures tested regularly

### Compliance Requirements
```yaml
# security/compliance-checks.yml
security_scans:
  - name: "Container Image Vulnerability Scan"
    tool: "Trivy"
    threshold: "HIGH"
    action: "fail"
  
  - name: "Secret Detection"
    tool: "GitLeaks"
    scope: "all_files"
    action: "fail"
  
  - name: "License Compliance"
    tool: "FOSSA"
    scope: "dependencies"
    action: "warn"

audit_requirements:
  - deployment_logs: "retained_90_days"
  - access_logs: "retained_365_days"
  - security_events: "retained_2_years"
  - compliance_reports: "monthly"
```


## Testing Strategy

### Workflow Testing
- **Unit Tests**: Individual script validation
- **Integration Tests**: Full pipeline execution
- **Security Tests**: Vulnerability and compliance scans
- **Performance Tests**: Deployment speed and reliability
- **Rollback Tests**: Failure scenario validation

### Validation Criteria
- Development deployment completes in < 10 minutes
- Production deployment completes in < 30 minutes
- Zero-downtime deployments achieved
- Rollback completes in < 5 minutes
- 99.9% deployment success rate

## Risk Assessment

### High Priority Risks
| Risk | Impact | Mitigation |
|------|--------|------------|
| Self-hosted runner failure | High | Multiple runner instances, fallback to GitHub hosted |
| Tailscale connectivity issues | Medium | VPN backup, local network fallback |
| Docker registry unavailability | High | Multiple registry mirrors, local caching |
| Raspberry Pi network issues | Medium | Batch updates, device health monitoring |

## Success Metrics

### Quantitative Metrics
- **< 10 minutes** for development deployments
- **< 30 minutes** for production deployments
- **99.9%** deployment success rate
- **< 5 minutes** mean time to rollback
- **100%** infrastructure provisioned via automation

### Qualitative Metrics
- Zero manual deployment steps required
- Team confidence in deployment process
- Reduced deployment-related incidents
- Improved development velocity

## Deliverables

### Phase 3 Outputs
- [ ] Complete GitHub Actions workflows for all environments
- [ ] Automated Raspberry Pi device management
- [ ] Health checking and monitoring automation
- [ ] Integration testing framework
- [ ] Rollback and disaster recovery procedures
- [ ] Security scanning and compliance validation
- [ ] Deployment monitoring dashboard
- [ ] Team training and runbooks

### Handoff to Phase 4
- All deployment workflows functional and tested
- Monitoring and alerting systems operational
- Security and compliance measures implemented
- Team trained on deployment procedures
- Documentation complete and accessible

---

**Phase Owner**: DevOps Team  
**Status**: Ready for Implementation  
**Dependencies**: Phase 2 completion  
**Risk Level**: Medium
