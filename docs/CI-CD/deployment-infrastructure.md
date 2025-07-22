# Deployment & Infrastructure

This document covers production deployment processes, container orchestration, network management, and monitoring for the Smart Smoker V2 project.

## Version Deployments

To create a new production deployment:

1. **Update version** in `package.json`
2. **Create a version tag** in GitHub for that commit
3. **Run the `Install Smart Smoker v2` GitHub action** with the new version number

## Container Deployment

### Smoker Environment
Containers for the smoker are handled by **watchtower**. When a new container is pushed to Docker Hub, watchtower automatically pulls it down and replaces the running container on the smoker. 

The deployment workflow is set for manual trigger and must be used when there are updates to:
- `smoker.docker-compose.yml` 
- `smoker-deploy.yml` 

Watchtower settings can be seen in the `smoker.docker-compose.yml` file.

### Cloud Environment
Containers for the cloud are deployed via GitHub Action workflows.

## Network Management

### Tailscale Configuration
Using **Tailscale** to manage the network, providing a private internal network for all devices.

Tailscale creates the SSL cert and key and also serves the sites. The **Tailscale funnel** feature is used to expose the frontend and backend to the public web for the cloud app:

- **Frontend**: https://smokecloud.tail74646.ts.net
- **Backend**: https://smokecloud.tail74646.ts.net:8443

### Verifying Tailscale Setup
Use the command `tailscale funnel status` - it should result in this output if correctly set up:

```bash
ubuntu@ubuntu:/etc/nginx/sites-available$ sudo tailscale funnel status

# Funnel on:
#     - https://smokecloud.tail74646.ts.net
#     - https://smokecloud.tail74646.ts.net:8443

https://smokecloud.tail74646.ts.net (Funnel on)
|-- / proxy http://127.0.0.1:80

https://smokecloud.tail74646.ts.net:8443 (Funnel on)
|-- / proxy http://127.0.0.1:3001
```

### Setting Up Tailscale Funnel
To configure services for external access:

1. **Set up serve**: `tailscale serve http:<port> / <local_port>`
2. **Enable funnel**: `tailscale funnel <port> on`

Repeat for each service you want accessible outside the network.

### Deployment Workflow Notes
For the deploy workflow, the process requires:
1. **Stop** the Tailscale service
2. **Run** `docker compose up` 
3. **Start** Tailscale service again

This is necessary because Tailscale holds onto the ports needed, so it must be stopped first to allow containers to bind to the ports, then restarted.

### Tailscale Documentation Links
- [General Setup](https://tailscale.com/kb/start/)
- [Tailscale Serve](https://tailscale.com/kb/1242/tailscale-serve/)
- [HTTPS Configuration](https://tailscale.com/kb/1153/enabling-https/)

## Container Monitoring

### Portainer Setup
Using **Portainer** to host the container monitoring dashboard.

#### Cloud Pi Installation
To install Portainer on the cloud pi, run the following Docker command:

```bash
docker run -d -p 10000:9000 --name portainer --restart always \
  -v /var/run/docker.sock:/var/run/docker.sock \
  portainer/portainer-ce
```

Once installed, connect to it via `smokerCloudIp:10000` (using port 10000 because it was the last available funnel port in Tailscale).

#### Smoker Pi Setup
To set up the smoker pi, follow the [Portainer Agent Environment instructions](https://docs.portainer.io/admin/environments/add/docker/agent) to configure a Portainer agent environment.

**Note**: Portainer is not included in the deployment process as it operates as a separate entity from the smoker app. Additionally, resetting the container clears all settings.

## Docker Commands Reference

### Smoker App Commands

#### Build and Push Test Smoker Image
**Prerequisites**: Run `npm run build` for smoker first

```bash
# Build for ARM/v7 platform
docker build -f apps/smoker/Dockerfile --platform linux/arm/v7 \
  -t benjr70/smart_smoker:smokerTest .

# Push to Docker Hub
docker push benjr70/smart_smoker:smokerTest
```

#### Pull and Run Smoker Image on Pi
```bash
# Pull latest image
docker pull benjr70/smart_smoker:smokerTest

# Run container
docker run -p 8080:8080 benjr70/smart_smoker:smokerTest
```

### Device Service Commands

#### Build and Push Test Device Service Image
```bash
# Build for ARM/v7 platform
docker build -f apps/device-service/Dockerfile --platform linux/arm/v7 \
  -t benjr70/smart_smoker:device-serviceTest .

# Push to Docker Hub
docker push benjr70/smart_smoker:device-serviceTest
```

#### Pull and Run Device Service on Pi
```bash
# Pull latest image
docker pull benjr70/smart_smoker:device-serviceTest

# Run container with USB device access
docker run --privileged --device=/dev/ttyUSB0 -p 3000:3000 \
  benjr70/smart_smoker:device-serviceTest
```

## Architecture Overview

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Development   │    │   Docker Hub     │    │   Production    │
│                 │    │                  │    │                 │
│ • Build Images  │───▶│ • Store Images   │───▶│ • Watchtower    │
│ • Push Updates  │    │ • Version Tags   │    │ • Auto Deploy  │
│ • Test Locally  │    │ • Multi-arch     │    │ • Health Check  │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         │              ┌────────▼───────┐               │
         │              │   Tailscale    │               │
         └──────────────│ • Private Net  │◀──────────────┘
                        │ • SSL/HTTPS    │
                        │ • Public Funnel│
                        └────────────────┘
```
