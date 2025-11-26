# Phase 2: Proxmox Infrastructure Setup

## Overview

Phase 2 establishes the foundational infrastructure on Proxmox using Terraform, sets up the self-hosted GitHub Actions runner, and creates the base environments for development and production cloud deployments.

## Architectural Assessment

This infrastructure represents a pragmatic, cost-effective solution optimized for a single-developer, personal project context. The architecture prioritizes simplicity and local control over distributed high availability, making deliberate trade-offs appropriate for the project's scale and requirements.

## Goals & Objectives

### Primary Goals
- **Infrastructure as Code**: Implement Terraform for complete infrastructure management
- **Self-Hosted Runner**: Set up GitHub Actions runner with Proxmox access
- **Base Environments**: Create LXC containers for cloud environments
- **Networking Setup**: Configure bridge networking and Tailscale integration
- **Security**: Implement proper authentication and access controls

### Success Criteria
- ✅ Terraform successfully provisions all infrastructure
- ✅ Self-hosted runner can deploy to Proxmox environments
- ✅ All environments accessible via Tailscale network
- ✅ Proper backup and monitoring in place
- ✅ Documentation and runbooks completed

## Architecture Components

### Infrastructure Layout
```
Proxmox Server
├── github-runner (LXC Container)
│   ├── Ubuntu 22.04 LTS
│   ├── 2 CPU cores, 4GB RAM, 50GB storage
│   ├── GitHub Actions runner service
│   ├── Terraform with Proxmox provider
│   ├── Docker CLI for deployments
│   ├── Tailscale client
│   └── Node.js/npm for builds
│
├── smart-smoker-dev-cloud (LXC Container)
│   ├── Ubuntu 22.04 LTS
│   ├── 2 CPU cores, 4GB RAM, 20GB storage
│   ├── Docker Engine
│   ├── Docker Compose
│   ├── Git for deployments
│   ├── Tailscale client
│   └── Environment: Development
│
├── virtual-smoker-device (VM - ARM64)
│   ├── Raspberry Pi OS Lite 64-bit
│   ├── 2 CPU cores (ARM64), 2GB RAM, 32GB storage
│   ├── VNC Server for GUI access
│   ├── Mock hardware simulation services
│   ├── Python serial communication simulators
│   ├── Node.js device service environment
│   ├── GPIO simulation libraries
│   ├── Temperature sensor mock data generators
│   ├── Wi-Fi configuration management
│   ├── Tailscale client for network integration
│   └── Environment: Virtual Device Testing
│
└── smart-smoker-cloud-prod (LXC Container)
    ├── Ubuntu 22.04 LTS
    ├── 4 CPU cores, 8GB RAM, 40GB storage
    ├── Docker Engine
    ├── Docker Compose
    ├── Git for deployments
    ├── Tailscale client with funnel
    ├── Automated backup integration
    └── Environment: Production
```

## User Stories

### Story 1: Automated Infrastructure Provisioning
**As a** DevOps engineer  
**I want** to provision infrastructure using code  
**So that** environments are consistent and reproducible

**Acceptance Criteria:**
- Terraform creates all LXC containers from configuration
- Infrastructure changes tracked in version control
- Environments can be recreated from scratch
- Resource allocation matches specifications

#### Implementation Notes (2025-09-28)
- Terraform configuration lives at `infra/proxmox/terraform` with reusable modules for LXC containers and the ARM64 virtual device (`modules/lxc-container`, `modules/arm64-vm`).
- Environment blueprints (`environments/*`) wrap the reusable modules to keep specs for the runner, dev cloud, prod cloud, and virtual smoker device readable.
- A shared `terraform.tfvars.example` documents every required input; copy it to `terraform.tfvars` and replace placeholders before planning/applying.
- State defaults to `infra/proxmox/terraform/state/terraform.tfstate`; switch to a remote backend before multiple engineers run Terraform.
- A helper script at `infra/proxmox/scripts/create-cloud-init-template.sh` provisions the Ubuntu cloud-init VM template required for cloning the virtual smoker environment—run it on the Proxmox host and then reference the reported VMID in `clone_template`.

#### Manual Validation Checklist
1. From `infra/proxmox/terraform`, copy `terraform.tfvars.example` to `terraform.tfvars` and populate Proxmox API token, storage pools, and static IPs.
2. Run `terraform init`.
3. Validate `github-runner` first: `terraform plan -target=module.github_runner` and review the diff for resource sizing and networking.
4. Apply the targeted plan with `terraform apply -target=module.github_runner` to create the container manually on the Proxmox host.
5. Repeat for `module.dev_cloud`, `module.prod_cloud`, and `module.virtual_smoker` once the runner is verified.
6. After testing, promote to full automation by running `terraform plan`/`terraform apply` without the `-target` flag.

### Story 2: Self-Hosted CI/CD
**As a** developer
**I want** GitHub Actions to deploy to local infrastructure
**So that** I can automate deployments without exposing servers

**Acceptance Criteria:**
- GitHub runner connects securely to repository
- Runner can access Proxmox API for deployments
- Terraform executions work from runner
- Logs and status reported back to GitHub

#### Implementation Notes (2025-10-05)
- Complete Ansible configuration for all infrastructure at `infra/proxmox/ansible/` using Infrastructure as Code principles
- 7 Ansible roles implemented: `common` (SSH hardening, firewall, fail2ban), `docker` (Docker Engine + Compose), `terraform`, `nodejs`, `github-runner`, `cloud-app`, `virtual-device`
- Automated configuration eliminates manual setup - all prerequisites installed via Ansible playbooks
- Inventory configuration at `inventory/hosts.yml` with group-based variable management
- Individual playbooks for each server type: `setup-github-runner.yml`, `setup-dev-cloud.yml`, `setup-prod-cloud.yml`, `setup-virtual-smoker.yml`
- Master playbook `site.yml` configures all infrastructure in one command
- Verification playbook `verify-all.yml` validates all configurations
- GitHub Actions workflow `ansible-lint.yml` provides CI/CD validation for Ansible code
- Comprehensive documentation in `infra/proxmox/ansible/README.md`
- Security hardening: SSH key-only auth, UFW firewall with minimal ports, fail2ban protection
- Note: Tailscale mesh networking configuration deferred to Story 3

#### Ansible Quick Start
```bash
# Configure all infrastructure
cd infra/proxmox/ansible
ansible-playbook playbooks/site.yml

# Configure GitHub runner with token
ansible-playbook playbooks/setup-github-runner.yml \
  --extra-vars "github_runner_token=YOUR_TOKEN"

# Verify configuration
ansible-playbook playbooks/verify-all.yml
```

### Story 3: Secure Network Access
**As a** system administrator  
**I want** all environments accessible via Tailscale  
**So that** I have secure remote access for management

**Acceptance Criteria:**
- All containers connected to Tailscale network
- Internal communication between environments
- Remote access for debugging and monitoring
- Production funnel configuration automated

### Story 4: Virtual Device Testing ⏸️ **DEFERRED TO PHASE 4**
**As a** developer
**I want** a virtual Raspberry Pi environment for testing
**So that** I can develop and test device functionality without physical hardware

**Status**: Deferred to Phase 4 - Not required for core infrastructure deployment

**Rationale**: Virtual smoker device is valuable for testing but not critical for application deployment. Moving to Phase 4 (Testing & Documentation) where it belongs with other testing infrastructure.

**See**: Phase 4, Story 0 for complete implementation details

## Technical Requirements

### Terraform Configuration Structure
```
infra/
├── terraform/
│   ├── modules/
│   │   ├── lxc-container/
│   │   │   ├── main.tf
│   │   │   ├── variables.tf
│   │   │   └── outputs.tf
│   │   ├── arm64-vm/
│   │   │   ├── main.tf
│   │   │   ├── variables.tf
│   │   │   └── outputs.tf
│   │   ├── networking/
│   │   │   ├── main.tf
│   │   │   ├── variables.tf
│   │   │   └── outputs.tf
│   │   └── storage/
│   │       ├── main.tf
│   │       ├── variables.tf
│   │       └── outputs.tf
│   ├── environments/
│   │   ├── github-runner/
│   │   │   ├── main.tf
│   │   │   ├── variables.tf
│   │   │   └── terraform.tfvars
│   │   ├── dev-cloud/
│   │   │   ├── main.tf
│   │   │   ├── variables.tf
│   │   │   └── terraform.tfvars
│   │   ├── virtual-smoker/
│   │   │   ├── main.tf
│   │   │   ├── variables.tf
│   │   │   ├── terraform.tfvars
│   │   │   └── scripts/
│   │   │       ├── setup-vnc.sh
│   │   │       ├── install-mocks.sh
│   │   │       └── configure-device.sh
│   │   └── prod-cloud/
│   │       ├── main.tf
│   │       ├── variables.tf
│   │       └── terraform.tfvars
│   └── shared/
│       ├── providers.tf
│       ├── variables.tf
│       └── backend.tf
```

### Proxmox Provider Configuration
```hcl
terraform {
  required_providers {
    proxmox = {
      source  = "telmate/proxmox"
      version = "~> 2.9.14"
    }
  }
}

provider "proxmox" {
  pm_api_url      = var.proxmox_api_url
  pm_user         = var.proxmox_user
  pm_password     = var.proxmox_password
  pm_tls_insecure = true
}
```

### LXC Container Module
```hcl
resource "proxmox_lxc" "container" {
  target_node     = var.target_node
  hostname        = var.hostname
  ostemplate      = var.template
  password        = var.root_password
  unprivileged    = true
  onboot          = true
  start           = true
  
  rootfs {
    storage = var.storage
    size    = var.disk_size
  }
  
  network {
    name   = "eth0"
    bridge = var.network_bridge
    ip     = var.ip_address
    gw     = var.gateway
  }
  
  cores  = var.cpu_cores
  memory = var.memory_mb
  swap   = var.swap_mb
  
  ssh_public_keys = var.ssh_keys
  
  provisioner "remote-exec" {
    inline = [
      "apt-get update",
      "apt-get install -y docker.io docker-compose git curl",
      "systemctl enable docker",
      "systemctl start docker",
      "usermod -aG docker root"
    ]
  }
}
```

### GitHub Runner Setup
```bash
#!/bin/bash
# GitHub Actions Runner Installation Script

# Download and install runner
mkdir /opt/actions-runner && cd /opt/actions-runner
curl -o actions-runner-linux-x64-2.311.0.tar.gz -L \
  https://github.com/actions/runner/releases/download/v2.311.0/actions-runner-linux-x64-2.311.0.tar.gz
tar xzf ./actions-runner-linux-x64-2.311.0.tar.gz

# Configure runner
./config.sh \
  --url https://github.com/benjr70/Smart-Smoker-V2 \
  --token ${GITHUB_RUNNER_TOKEN} \
  --name proxmox-runner \
  --labels self-hosted,linux,x64,proxmox \
  --work /opt/actions-runner/_work

# Install as service
./svc.sh install
./svc.sh start

# Install Terraform
wget -O- https://apt.releases.hashicorp.com/gpg | sudo gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/hashicorp.list
apt update && apt install terraform

# Install Tailscale
curl -fsSL https://tailscale.com/install.sh | sh
tailscale up --authkey=${TAILSCALE_AUTH_KEY}
```

## Virtual Smoker Device Configuration

### ARM64 VM Module
```hcl
# infra/terraform/modules/arm64-vm/main.tf
resource "proxmox_vm_qemu" "arm64_vm" {
  name        = var.vm_name
  target_node = var.target_node
  desc        = var.vm_description
  
  # ARM64 QEMU Configuration
  machine     = "virt"
  bios        = "ovmf"
  cpu         = "cortex-a72"
  cores       = var.cpu_cores
  memory      = var.memory_mb
  
  # EFI Configuration for ARM64
  efidisk {
    storage = var.storage
    efitype = "4m"
  }
  
  # Primary disk
  disk {
    storage  = var.storage
    type     = "scsi"
    size     = var.disk_size
    iothread = 1
    discard  = "on"
  }
  
  # Network configuration
  network {
    model  = "virtio"
    bridge = var.network_bridge
  }
  
  # Enable VNC for GUI access
  vga {
    type   = "std"
    memory = 32
  }
  
  # Enable QEMU Guest Agent
  agent = 1
  
  # Boot configuration
  boot    = "order=scsi0"
  onboot  = true
  
  # Cloud-init configuration
  os_type   = "cloud-init"
  ciuser    = var.ci_user
  cipassword = var.ci_password
  
  ipconfig0 = "ip=${var.ip_address}/24,gw=${var.gateway}"
  
  # SSH keys
  sshkeys = var.ssh_keys
  
  # Provisioning
  provisioner "remote-exec" {
    connection {
      type     = "ssh"
      user     = var.ci_user
      password = var.ci_password
      host     = var.ip_address
    }
    
    inline = [
      "sudo apt-get update",
      "sudo apt-get install -y curl wget git python3 python3-pip nodejs npm",
      "sudo systemctl enable ssh",
      "sudo systemctl start ssh"
    ]
  }
  
  # Copy setup scripts
  provisioner "file" {
    source      = "${path.module}/../../environments/virtual-smoker/scripts/"
    destination = "/tmp/scripts"
    
    connection {
      type     = "ssh"
      user     = var.ci_user
      password = var.ci_password
      host     = var.ip_address
    }
  }
  
  # Execute setup scripts
  provisioner "remote-exec" {
    connection {
      type     = "ssh"
      user     = var.ci_user
      password = var.ci_password
      host     = var.ip_address
    }
    
    inline = [
      "chmod +x /tmp/scripts/*.sh",
      "sudo /tmp/scripts/setup-vnc.sh",
      "sudo /tmp/scripts/install-mocks.sh",
      "sudo /tmp/scripts/configure-device.sh"
    ]
  }
}
```

### Virtual Smoker Environment Configuration
```hcl
# infra/terraform/environments/virtual-smoker/main.tf
module "virtual_smoker" {
  source = "../../modules/arm64-vm"
  
  vm_name         = "virtual-smoker-device"
  target_node     = var.proxmox_node
  vm_description  = "Virtual Raspberry Pi for Smart Smoker Development"
  
  cpu_cores       = 2
  memory_mb       = 2048
  disk_size       = "32G"
  storage         = var.proxmox_storage
  
  network_bridge  = var.network_bridge
  ip_address      = var.vm_ip
  gateway         = var.network_gateway
  
  ci_user         = "pi"
  ci_password     = var.vm_password
  ssh_keys        = var.ssh_public_keys
}

# Output VNC connection details
output "vnc_connection" {
  value = {
    host = var.vm_ip
    port = 5900
    user = "pi"
  }
}

# Output SSH connection details
output "ssh_connection" {
  value = {
    host = var.vm_ip
    user = "pi"
    command = "ssh pi@${var.vm_ip}"
  }
}
```

### VNC Server Setup Script
```bash
#!/bin/bash
# infra/terraform/environments/virtual-smoker/scripts/setup-vnc.sh

echo "Setting up VNC Server for virtual smoker device..."

# Install VNC server and desktop environment
apt-get update
apt-get install -y \
  tightvncserver \
  xfce4 \
  xfce4-goodies \
  firefox-esr \
  nano \
  htop

# Create VNC service for pi user
cat > /etc/systemd/system/vncserver@.service << 'EOF'
[Unit]
Description=Start TightVNC server at startup
After=syslog.target network.target

[Service]
Type=forking
User=pi
Group=pi
WorkingDirectory=/home/pi

PIDFile=/home/pi/.vnc/%H:%i.pid
ExecStartPre=-/usr/bin/vncserver -kill :%i > /dev/null 2>&1
ExecStart=/usr/bin/vncserver -depth 24 -geometry 1280x800 :%i
ExecStop=/usr/bin/vncserver -kill :%i

[Install]
WantedBy=multi-user.target
EOF

# Set up VNC password for pi user
sudo -u pi mkdir -p /home/pi/.vnc
echo -e "smoker123\nsmoker123\nn" | sudo -u pi vncpasswd

# Configure VNC startup
sudo -u pi cat > /home/pi/.vnc/xstartup << 'EOF'
#!/bin/bash
xrdb $HOME/.Xresources
startxfce4 &
EOF

sudo -u pi chmod +x /home/pi/.vnc/xstartup

# Enable and start VNC service
systemctl daemon-reload
systemctl enable vncserver@1.service
systemctl start vncserver@1.service

echo "VNC server setup complete. Connect to ${VM_IP}:5901"
```

### Mock Hardware Installation Script
```bash
#!/bin/bash
# infra/terraform/environments/virtual-smoker/scripts/install-mocks.sh

echo "Installing mock hardware simulation services..."

# Install Python dependencies for hardware simulation
pip3 install \
  pyserial \
  RPi.GPIO \
  w1thermsensor \
  flask \
  websocket-client \
  adafruit-circuitpython-max31855

# Create mock services directory
mkdir -p /opt/smoker-mocks
cd /opt/smoker-mocks

# Create temperature sensor mock service
cat > temperature_mock.py << 'EOF'
#!/usr/bin/env python3
"""
Mock Temperature Sensor Service
Simulates DS18B20 temperature sensors for smoker development
"""
import time
import random
import json
import threading
from flask import Flask, jsonify

app = Flask(__name__)

class TemperatureMock:
    def __init__(self):
        self.sensors = {
            'smoker_temp': {'current': 225.0, 'target': 225.0},
            'meat_temp': {'current': 145.0, 'target': 165.0},
            'ambient_temp': {'current': 75.0, 'target': 75.0}
        }
        self.running = False
        
    def start_simulation(self):
        self.running = True
        thread = threading.Thread(target=self._simulate_temperatures)
        thread.daemon = True
        thread.start()
        
    def _simulate_temperatures(self):
        while self.running:
            for sensor_name, data in self.sensors.items():
                # Simulate temperature fluctuation
                variance = random.uniform(-2.0, 2.0)
                drift_to_target = (data['target'] - data['current']) * 0.1
                data['current'] += variance + drift_to_target
                data['current'] = max(32.0, min(500.0, data['current']))
            time.sleep(2)
    
    def get_temperature(self, sensor_id):
        sensor_map = {
            '28-000000000001': 'smoker_temp',
            '28-000000000002': 'meat_temp', 
            '28-000000000003': 'ambient_temp'
        }
        sensor_name = sensor_map.get(sensor_id, 'smoker_temp')
        return self.sensors[sensor_name]['current']
    
    def set_target(self, sensor_id, target):
        sensor_map = {
            '28-000000000001': 'smoker_temp',
            '28-000000000002': 'meat_temp',
            '28-000000000003': 'ambient_temp'
        }
        sensor_name = sensor_map.get(sensor_id, 'smoker_temp')
        if sensor_name in self.sensors:
            self.sensors[sensor_name]['target'] = target

temp_mock = TemperatureMock()
temp_mock.start_simulation()

@app.route('/temperature/<sensor_id>')
def get_temperature(sensor_id):
    temp = temp_mock.get_temperature(sensor_id)
    return jsonify({'sensor_id': sensor_id, 'temperature': temp})

@app.route('/temperature/<sensor_id>/target/<float:target>', methods=['POST'])
def set_target_temperature(sensor_id, target):
    temp_mock.set_target(sensor_id, target)
    return jsonify({'sensor_id': sensor_id, 'target': target})

@app.route('/status')
def get_status():
    return jsonify(temp_mock.sensors)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
EOF

# Create serial communication mock service
cat > serial_mock.py << 'EOF'
#!/usr/bin/env python3
"""
Mock Serial Communication Service
Simulates Arduino/microcontroller serial communication
"""
import serial
import threading
import time
import json
import socket

class SerialMock:
    def __init__(self, port='/dev/ttyUSB0', baudrate=9600):
        self.port = port
        self.baudrate = baudrate
        self.running = False
        self.commands = []
        
    def start_mock_serial(self):
        """Start mock serial device using socat"""
        import subprocess
        
        # Create virtual serial port pair
        cmd = f"socat -d -d pty,raw,echo=0 pty,raw,echo=0"
        self.socat_process = subprocess.Popen(cmd.split())
        time.sleep(2)  # Allow ports to be created
        
        # Start command processor
        self.running = True
        thread = threading.Thread(target=self._process_commands)
        thread.daemon = True
        thread.start()
        
    def _process_commands(self):
        """Process incoming serial commands"""
        while self.running:
            # Simulate receiving commands
            mock_commands = [
                "GET_TEMP",
                "SET_FAN_SPEED:50", 
                "GET_STATUS",
                "SET_AUGER:ON"
            ]
            
            for cmd in mock_commands:
                self.commands.append(cmd)
                time.sleep(5)
                
    def send_response(self, command):
        """Send mock response based on command"""
        responses = {
            "GET_TEMP": "TEMP:225.5",
            "GET_STATUS": "STATUS:RUNNING",
            "SET_FAN_SPEED": "FAN:OK",
            "SET_AUGER": "AUGER:OK"
        }
        
        base_cmd = command.split(':')[0]
        return responses.get(base_cmd, "OK")

# Create WebSocket mock for device service
cat > websocket_mock.py << 'EOF'
#!/usr/bin/env python3
"""
Mock WebSocket Service for Device Communication
"""
import asyncio
import websockets
import json
import time

class WebSocketMock:
    def __init__(self):
        self.clients = set()
        
    async def register_client(self, websocket):
        self.clients.add(websocket)
        print(f"Client connected: {websocket.remote_address}")
        
    async def unregister_client(self, websocket):
        self.clients.remove(websocket)
        print(f"Client disconnected: {websocket.remote_address}")
        
    async def broadcast_data(self):
        """Broadcast mock sensor data to all connected clients"""
        while True:
            if self.clients:
                message = {
                    'type': 'sensor_data',
                    'timestamp': time.time(),
                    'data': {
                        'smoker_temp': 225.0 + (time.time() % 10 - 5),
                        'meat_temp': 145.0 + (time.time() % 5 - 2.5),
                        'fan_speed': 50,
                        'auger_status': 'ON'
                    }
                }
                
                disconnected = set()
                for client in self.clients:
                    try:
                        await client.send(json.dumps(message))
                    except websockets.exceptions.ConnectionClosed:
                        disconnected.add(client)
                
                # Remove disconnected clients
                for client in disconnected:
                    await self.unregister_client(client)
                    
            await asyncio.sleep(2)
    
    async def handle_client(self, websocket, path):
        await self.register_client(websocket)
        try:
            async for message in websocket:
                data = json.loads(message)
                print(f"Received: {data}")
                
                # Echo back confirmation
                response = {
                    'type': 'command_ack',
                    'original': data,
                    'status': 'success'
                }
                await websocket.send(json.dumps(response))
                
        except websockets.exceptions.ConnectionClosed:
            pass
        finally:
            await self.unregister_client(websocket)

mock = WebSocketMock()

# Start WebSocket server
start_server = websockets.serve(mock.handle_client, "0.0.0.0", 8765)

# Start broadcasting task
async def main():
    await asyncio.gather(
        start_server,
        mock.broadcast_data()
    )

if __name__ == '__main__':
    asyncio.run(main())
EOF

# Create systemd services for mock services
cat > /etc/systemd/system/temperature-mock.service << 'EOF'
[Unit]
Description=Temperature Mock Service
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/opt/smoker-mocks
ExecStart=/usr/bin/python3 temperature_mock.py
Restart=always

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/websocket-mock.service << 'EOF'
[Unit]
Description=WebSocket Mock Service
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/opt/smoker-mocks
ExecStart=/usr/bin/python3 websocket_mock.py
Restart=always

[Install]
WantedBy=multi-user.target
EOF

# Set permissions and enable services
chmod +x /opt/smoker-mocks/*.py
chown -R pi:pi /opt/smoker-mocks

systemctl daemon-reload
systemctl enable temperature-mock.service
systemctl enable websocket-mock.service
systemctl start temperature-mock.service
systemctl start websocket-mock.service

echo "Mock hardware services installed and started"
```

### Device Configuration Script
```bash
#!/bin/bash
# infra/terraform/environments/virtual-smoker/scripts/configure-device.sh

echo "Configuring virtual smoker device environment..."

# Install Node.js environment for device service
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
apt-get install -y nodejs

# Install global packages
npm install -g @nestjs/cli pm2

# Create device service directory
sudo -u pi mkdir -p /home/pi/smart-smoker-device
cd /home/pi/smart-smoker-device

# Clone and setup device service (in real implementation)
sudo -u pi git clone https://github.com/benjr70/Smart-Smoker-V2.git .

# Install dependencies
sudo -u pi npm install

# Create device-specific environment configuration
sudo -u pi cat > .env << 'EOF'
# Virtual Device Configuration
NODE_ENV=development
DEVICE_TYPE=virtual
MOCK_HARDWARE=true

# Serial Configuration
SERIAL_PORT=/dev/ttyUSB0
SERIAL_BAUDRATE=9600

# WebSocket Configuration
WEBSOCKET_URL=ws://localhost:8765
BACKEND_URL=ws://smoker-dev-cloud:3001

# Temperature Sensors
SMOKER_TEMP_SENSOR=28-000000000001
MEAT_TEMP_SENSOR=28-000000000002
AMBIENT_TEMP_SENSOR=28-000000000003

# Mock Service URLs
TEMP_MOCK_URL=http://localhost:5000
SERIAL_MOCK_ENABLED=true
WEBSOCKET_MOCK_ENABLED=true

# GPIO Pin Configuration (for mock GPIO library)
FAN_PIN=18
AUGER_PIN=19
TEMP_ALERT_PIN=20
EOF

# Create PM2 ecosystem file for device service
sudo -u pi cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'virtual-smoker-device',
    script: 'dist/main.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'development',
      PORT: 3002
    }
  }]
};
EOF

# Install Tailscale for network integration
curl -fsSL https://tailscale.com/install.sh | sh

# Configure automatic startup script
sudo -u pi cat > /home/pi/start-virtual-smoker.sh << 'EOF'
#!/bin/bash
echo "Starting Virtual Smoker Device Services..."

# Start Tailscale if not running
if ! pgrep -x "tailscaled" > /dev/null; then
    sudo systemctl start tailscaled
    sleep 3
fi

# Connect to Tailscale network
if [ ! -z "$TAILSCALE_AUTH_KEY" ]; then
    sudo tailscale up --authkey=$TAILSCALE_AUTH_KEY --hostname=virtual-smoker
fi

# Build and start device service
cd /home/pi/smart-smoker-device
npm run build
pm2 start ecosystem.config.js

echo "Virtual Smoker Device is ready!"
echo "VNC: Connect to $(hostname -I | awk '{print $1}'):5901"
echo "Device Service: http://$(hostname -I | awk '{print $1}'):3002"
echo "Mock Temperature API: http://$(hostname -I | awk '{print $1}'):5000"
echo "Mock WebSocket: ws://$(hostname -I | awk '{print $1}'):8765"
EOF

chmod +x /home/pi/start-virtual-smoker.sh

# Create desktop shortcut for easy access
sudo -u pi mkdir -p /home/pi/Desktop
sudo -u pi cat > /home/pi/Desktop/SmartSmokerDev.desktop << 'EOF'
[Desktop Entry]
Version=1.0
Type=Application
Name=Smart Smoker Development
Comment=Start Smart Smoker development environment
Exec=/home/pi/start-virtual-smoker.sh
Icon=applications-development
Terminal=true
Categories=Development;
EOF

chmod +x /home/pi/Desktop/SmartSmokerDev.desktop

# Set ownership
chown -R pi:pi /home/pi/

echo "Virtual smoker device configuration complete"
echo "Reboot the system to complete setup"
```

### Virtual Smoker Testing Guide
```markdown
# Virtual Smoker Device Testing

## Access Methods

### VNC Access
- **Host**: `<vm-ip-address>`
- **Port**: `5901`
- **Password**: `smoker123`
- **Resolution**: `1280x800`

### SSH Access
```bash
ssh pi@<vm-ip-address>
# Password: configured during terraform apply
```

### Web Interfaces
- **Mock Temperature API**: `http://<vm-ip>:5000`
- **Device Service**: `http://<vm-ip>:3002` 
- **WebSocket Mock**: `ws://<vm-ip>:8765`

## Testing Scenarios

### 1. Temperature Sensor Testing
```bash
# Check mock temperature service
curl http://localhost:5000/status

# Get specific sensor reading
curl http://localhost:5000/temperature/28-000000000001

# Set target temperature
curl -X POST http://localhost:5000/temperature/28-000000000001/target/250
```

### 2. Device Service Integration
```bash
# Check device service status
pm2 status

# View device service logs
pm2 logs virtual-smoker-device

# Restart device service
pm2 restart virtual-smoker-device
```

### 3. WebSocket Communication
```javascript
// Test WebSocket connection
const ws = new WebSocket('ws://localhost:8765');
ws.onmessage = (event) => {
    console.log('Received:', JSON.parse(event.data));
};

// Send test command
ws.send(JSON.stringify({
    type: 'set_temperature',
    target: 225
}));
```

## Development Workflow

1. **Connect via VNC** for GUI access
2. **Open terminal** and navigate to project
3. **Make code changes** using nano or vim
4. **Test changes** using mock services
5. **Deploy to dev environment** via CI/CD
6. **Validate** against real backend

## Mock Service URLs
- Temperature API: http://localhost:5000
- WebSocket Server: ws://localhost:8765
- Device Service: http://localhost:3002
```

## Implementation Steps

### Step 1: Terraform Setup (Week 1)
1. **Create Terraform Configuration**
   ```bash
   mkdir -p infra/terraform/{modules,environments,shared}
   cd infra/terraform
   ```

2. **Configure Proxmox Provider**
   - Set up API credentials
   - Test connection to Proxmox
   - Create basic provider configuration

3. **Create LXC Module**
   - Parameterized container creation
   - Network configuration
   - Storage allocation
   - Post-creation provisioning

### Step 2: GitHub Runner Environment (Week 1-2)
1. **Provision Runner LXC**
   ```bash
   cd infra/terraform/environments/github-runner
   terraform init
   terraform plan
   terraform apply
   ```

2. **Install and Configure Runner**
   - Download GitHub Actions runner
   - Register with repository
   - Install Terraform and dependencies
   - Configure Tailscale access

3. **Test Runner Functionality**
   - Trigger test workflow
   - Verify Proxmox API access
   - Test Terraform execution

### Step 3: Cloud Environments (Week 2)
1. **Create Development Environment**
   ```bash
   cd infra/terraform/environments/dev-cloud
   terraform init
   terraform plan
   terraform apply
   ```

2. **Create Production Environment**
   ```bash
   cd infra/terraform/environments/prod-cloud
   terraform init
   terraform plan
   terraform apply
   ```

3. **Configure Networking**
   - Set up Tailscale on all containers
   - Configure internal communication
   - Test connectivity between environments

### Step 4: Integration Testing (Week 2-3)
1. **End-to-End Testing**
   - Deploy test application to dev environment
   - Verify GitHub runner can manage infrastructure
   - Test Tailscale connectivity and funnels

2. **Backup and Monitoring Setup**
   - Configure LXC container backups
   - Set up basic monitoring
   - Create alerting for critical services

## Tailscale Integration

### Network Configuration
```bash
# Development Environment Tailscale Setup
tailscale up --authkey=${TAILSCALE_AUTH_KEY} --hostname=smoker-dev-cloud
tailscale serve http:80 / 80
tailscale serve http:3001 / 3001

# Production Environment Tailscale Setup
tailscale up --authkey=${TAILSCALE_AUTH_KEY} --hostname=smokecloud
tailscale serve http:80 / 80
tailscale serve http:3001 / 3001
tailscale funnel 80 on
tailscale funnel 3001 on
```

### Automated Funnel Configuration
```bash
#!/bin/bash
# Production Tailscale Funnel Setup Script

configure_production_funnel() {
  echo "Configuring Tailscale funnel for production..."
  
  # Set up serves for existing endpoints
  tailscale serve http:80 / 80
  tailscale serve http:8443 / 3001
  
  # Enable funnels for public access
  tailscale funnel 80 on
  tailscale funnel 8443 on
  
  # Verify configuration matches current setup
  expected_status=$(cat << EOF
https://smokecloud.tail74646.ts.net (Funnel on)
|-- / proxy http://127.0.0.1:80

https://smokecloud.tail74646.ts.net:8443 (Funnel on)
|-- / proxy http://127.0.0.1:3001
EOF
)
  
  current_status=$(tailscale funnel status)
  echo "Current Tailscale status:"
  echo "$current_status"
}
```

## Security Configuration

### Proxmox API Access
```bash
# Create dedicated Terraform user
pveum user add terraform@pve
pveum passwd terraform@pve

# Create role with minimal required permissions
pveum role add TerraformRole -privs "VM.Allocate VM.Clone VM.Config.CDROM VM.Config.CPU VM.Config.Cloudinit VM.Config.Disk VM.Config.HWType VM.Config.Memory VM.Config.Network VM.Config.Options VM.Monitor VM.Audit VM.PowerMgmt Datastore.AllocateSpace Datastore.Audit Pool.Allocate Sys.Audit Sys.Console Sys.Modify"

# Assign role to user
pveum aclmod / -user terraform@pve -role TerraformRole
```

### SSH Key Management
```bash
# Generate SSH key for automation
ssh-keygen -t ed25519 -f ~/.ssh/proxmox_automation -N ""

# Add public key to Terraform configuration
echo "ssh_public_keys = [\"$(cat ~/.ssh/proxmox_automation.pub)\"]" >> terraform.tfvars
```

## Testing Strategy

### Infrastructure Testing
- **Terraform Validation**: `terraform validate` on all configurations
- **Plan Verification**: Review `terraform plan` output before apply
- **Connectivity Testing**: Verify network access between containers
- **Resource Verification**: Confirm CPU, memory, and storage allocation

### Integration Testing
- **GitHub Runner Testing**: Execute test workflows from runner
- **Tailscale Testing**: Verify internal and external network access
- **Application Deployment**: Deploy test containers to verify functionality
- **Backup Testing**: Test container backup and restore procedures

### Security Testing
- **Access Control**: Verify least-privilege access works
- **Network Isolation**: Test container network boundaries
- **Authentication**: Validate Tailscale and SSH key authentication
- **API Security**: Confirm Proxmox API access restrictions

## Architecture Decision Records (ADR)

### ADR-001: Proxmox + LXC over Cloud Providers

**Context**: Need to host development and production cloud environments.

**Decision**: Use local Proxmox server with LXC containers instead of cloud providers (AWS, GCP, Azure).

**Rationale**:
- **Cost**: Zero monthly infrastructure cost vs $20-50+/month for equivalent cloud resources
- **Control**: Full control over hardware, networking, and resource allocation
- **Performance**: Local network latency for development (microseconds vs 50-200ms to cloud)
- **Learning**: Hands-on experience with bare metal virtualization and infrastructure
- **Privacy**: Sensitive data and development work remain on-premises

**Trade-offs**:
- **Availability**: Single point of failure (no geographic redundancy)
- **Scalability**: Limited by physical server capacity
- **Maintenance**: Responsible for hardware, power, cooling, and networking
- **Accessibility**: Requires Tailscale VPN or port forwarding for external access

**Status**: Accepted - Appropriate for single-user, personal project context

### ADR-002: Terraform + Ansible over Alternative Tools

**Context**: Need infrastructure provisioning and configuration management.

**Decision**: Use Terraform for infrastructure provisioning and Ansible for configuration management.

**Rationale**:
- **Terraform**: Industry-standard IaC, excellent Proxmox provider support, declarative state management
- **Ansible**: Agentless configuration management, simple YAML syntax, extensive role ecosystem
- **Separation of Concerns**: Terraform provisions infrastructure, Ansible configures software
- **Idempotency**: Both tools support repeatable, safe execution
- **Community Support**: Large communities, abundant examples, active development

**Alternatives Considered**:
- **Proxmox API + Scripts**: Less maintainable, no state management, error-prone
- **Packer + Terraform**: Overkill for this scale, slower iteration during development
- **Cloud-Init Only**: Insufficient for complex multi-step configuration
- **Chef/Puppet**: Heavier weight, require agents, steeper learning curve

**Status**: Accepted

### ADR-003: Single Server Deployment

**Context**: Decide between single-server deployment vs distributed high-availability architecture.

**Decision**: Deploy all infrastructure on a single Proxmox server with LXC containers for isolation.

**Rationale**:
- **Appropriate Scale**: Single-user application with minimal concurrent load
- **Simplified Operations**: Single server to maintain, backup, and monitor
- **Cost Efficiency**: Maximum resource utilization without orchestration overhead
- **Development Velocity**: Faster iteration without distributed systems complexity
- **Local Networking**: All components on same physical host with high-speed networking

**Trade-offs**:
- **Single Point of Failure**: Server failure impacts all environments
- **No Geographic Redundancy**: All data in one physical location
- **Limited Scalability**: Cannot scale horizontally across multiple nodes
- **Resource Contention**: All workloads share same hardware resources

**Mitigation Strategies**:
- Regular automated backups to external storage
- UPS for power reliability
- Monitoring and alerting for early issue detection
- Documented disaster recovery procedures
- Keep Raspberry Pi deployment as emergency fallback

**Status**: Accepted - Matches project requirements and risk tolerance

### ADR-004: Local Terraform State Management

**Context**: Decide where to store Terraform state file.

**Decision**: Store Terraform state locally in `infra/proxmox/terraform/state/terraform.tfstate` for now.

**Rationale**:
- **Single Operator**: Only one person runs Terraform, no concurrency issues
- **Simplicity**: No additional infrastructure required (no S3, no Consul, no Terraform Cloud)
- **Version Control**: State changes tracked alongside code changes
- **Local Development**: Fast state access, no network dependencies
- **Cost**: Free, no state storage fees

**Trade-offs**:
- **No Locking**: Risk of concurrent modification if multiple people use Terraform
- **State Exposure**: Sensitive data in state file visible in repository
- **Collaboration**: Difficult for multiple team members to manage infrastructure
- **Backup**: Must manually backup state file

**Future Considerations**:
- Move to remote backend (S3 + DynamoDB, Terraform Cloud) if:
  - Multiple team members need to run Terraform
  - State file contains highly sensitive data
  - Need state locking and versioning

**Status**: Accepted - Appropriate for single-developer context, re-evaluate if team grows

### ADR-005: Tailscale for Network Access

**Context**: Need secure remote access to infrastructure and public exposure for production.

**Decision**: Use Tailscale mesh VPN for all infrastructure networking with Tailscale Funnel for public access.

**Rationale**:
- **Zero Configuration**: Automatic NAT traversal, no port forwarding
- **Security**: WireGuard encryption, certificate-based authentication
- **Simplicity**: No manual VPN server setup or SSL certificate management
- **Funnel Feature**: Built-in public HTTPS endpoint without reverse proxy
- **Multi-Platform**: Works on Proxmox LXC, Raspberry Pi, development machines
- **Free Tier**: Sufficient for personal project needs

**Alternatives Considered**:
- **Self-Hosted WireGuard**: More maintenance, manual configuration
- **OpenVPN**: Legacy technology, slower performance, complex setup
- **SSH Tunnels**: Not scalable, brittle, requires manual management
- **Public IP + Firewall**: Security risk, port management complexity
- **Cloudflare Tunnel**: Vendor lock-in, less control

**Status**: Accepted

## Risk Assessment

### High Priority Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Proxmox server hardware failure | Critical | Low | Regular backups, UPS, keep Pi as fallback |
| MongoDB version/authentication issues | Critical | High | **IMMEDIATE FIX NEEDED** - Upgrade to modern MongoDB version with authentication |
| Terraform state corruption | High | Low | Regular state backups, validate before apply |
| GitHub runner token expiration | Medium | Medium | Implement token rotation process, monitoring |
| Network connectivity issues | Medium | Low | Document troubleshooting, Tailscale + local access |
| Resource exhaustion on Proxmox | Medium | Low | Monitor resource usage, implement alerts |
| Backup failure | High | Low | **MISSING** - Implement automated backup validation |

### Critical Issues Identified

**MongoDB Security & Version**:
- Running MongoDB 4.4.14-rc0-focal (release candidate, not stable)
- No authentication configured (critical security risk)
- Outdated version (current stable is 7.x+)
- **Priority**: Must fix before any production use

**Backup Gaps**:
- No automated backup implementation
- No backup validation testing
- No documented restore procedures
- **Priority**: High - data loss risk

**State Management**:
- Local Terraform state in repository
- No state locking mechanism
- Sensitive data potentially exposed
- **Priority**: Medium - acceptable for single user, revisit if team grows

**Deployment Reliability**:
- Manual intervention required for some deployments
- No automated rollback on failure
- Limited deployment monitoring
- **Priority**: Medium - address in Phase 3

### Rollback Plan
1. **Infrastructure Rollback**: Use `terraform destroy` to remove environments
2. **Manual Cleanup**: Document manual removal procedures
3. **Backup Restoration**: Restore from LXC container backups if needed
4. **Fallback Deployment**: Maintain ability to deploy manually
5. **Emergency Fallback**: Keep Raspberry Pi production deployment as backup path

## Infrastructure Evolution Path

This section outlines the recommended improvements to address identified issues and enhance the infrastructure's reliability, security, and maintainability.

### Phase 3 Priority Adjustments

Based on the architectural review, Phase 3 priorities have been adjusted to address critical security and reliability concerns first:

**Critical (Must Fix Before Production)**:
1. **MongoDB Security & Upgrade** - Address authentication and version issues
2. **Automated Backup Implementation** - Implement and validate backup procedures

**High Priority (Address in Phase 3)**:
3. **Deployment Reliability** - Automated rollback and monitoring
4. **Production Database Migration** - Move production from Pi to Proxmox
5. **Backup Validation** - Automated backup testing and restore procedures

**Medium Priority (Future Enhancement)**:
6. **State Management** - Consider remote backend if team grows
7. **High Availability** - Only if requirements change significantly

### Short-Term Improvements (Next 1-3 Months)

**1. MongoDB Security & Version (CRITICAL)**
- Upgrade from MongoDB 4.4.14-rc0 to latest stable 7.x release
- Implement authentication with dedicated user accounts
- Configure RBAC with minimum required permissions
- Enable audit logging for production
- Document connection string changes for all services
- **Effort**: 1-2 days
- **Risk**: Medium (requires service restart, connection string updates)
- **Value**: Eliminates critical security vulnerability

**2. Automated Backup System**
- Implement automated LXC container backups via Proxmox
- Configure MongoDB dump backups for database-specific recovery
- Schedule daily backups with 7-day retention on Proxmox
- Weekly backups retained for 4 weeks on external storage
- Automated backup validation and integrity checks
- **Effort**: 2-3 days
- **Risk**: Low
- **Value**: Prevents data loss, enables disaster recovery

**3. Deployment Monitoring & Rollback**
- Implement health check automation in deployment workflows
- Add automated rollback on failed health checks
- Configure deployment status notifications (Slack/email)
- Add deployment metrics and dashboards
- **Effort**: 2-3 days
- **Risk**: Low
- **Value**: Reduces deployment failures, faster incident response

**4. Production Database Migration**
- Migrate production database from Raspberry Pi to Proxmox prod-cloud
- Zero-downtime migration strategy with validation
- Keep Pi as temporary fallback during transition
- **Effort**: 1 day migration + 1 week validation
- **Risk**: Medium (requires downtime window)
- **Value**: Better performance, reliability, and backup integration

### Long-Term Improvements (3-12 Months)

**5. Enhanced Monitoring & Observability**
- Implement centralized logging (Loki or similar)
- Add application performance monitoring (APM)
- Set up infrastructure metrics (Prometheus/Grafana)
- Configure alerting for critical services
- **Effort**: 1-2 weeks
- **Value**: Proactive issue detection, better debugging

**6. Disaster Recovery Automation**
- Automated disaster recovery testing
- Infrastructure-as-code recovery procedures
- Regular DR drills and documentation
- **Effort**: 3-5 days
- **Value**: Confidence in recovery capabilities

**7. Infrastructure Hardening**
- Implement network segmentation between environments
- Add intrusion detection and prevention
- Regular security scanning and patching automation
- **Effort**: 1 week
- **Value**: Enhanced security posture

### Future Scalability Path (If Requirements Change)

**Only pursue if the following conditions arise:**
- Multiple concurrent users (>10-20 simultaneous)
- Geographic distribution needs
- High availability requirements (>99.9% uptime)
- Multiple team members managing infrastructure

**Potential Future Architecture**:
- Multi-node Proxmox cluster for high availability
- Distributed MongoDB replica set
- Load balancing across multiple application instances
- Remote Terraform state with locking (Terraform Cloud, S3+DynamoDB)
- Multi-region deployment for geographic redundancy

**Current Assessment**: Not needed. Single-server deployment is appropriate for current scale and will remain so unless user base grows 10x or availability requirements increase significantly.

### Trade-offs & Design Philosophy

**Optimized For**:
- Low operational cost (near-zero monthly fees)
- Single-operator simplicity
- Development velocity and iteration speed
- Learning and experimentation
- Local control and privacy

**Explicitly Not Optimized For**:
- High availability (99.99% uptime)
- Geographic redundancy
- Massive scale (1000+ concurrent users)
- Enterprise-grade security compliance
- Multi-team collaboration

**Philosophy**: Start simple, evolve based on actual needs. Avoid premature optimization for scale or availability that may never be required. Maintain the ability to scale up if requirements change.

## Dependencies

### External Dependencies
- Proxmox VE server with API access enabled
- GitHub repository with Actions enabled
- Tailscale account with sufficient device limit
- Ubuntu 22.04 LTS template available in Proxmox

### Internal Dependencies
- Phase 1 container standardization completed
- Docker Hub repositories with new naming convention
- Team access to Proxmox management interface
- SSH access to Proxmox host for troubleshooting

## Success Metrics

### Quantitative Metrics
- **100%** infrastructure provisioned via Terraform
- **< 10 minutes** for complete environment provisioning
- **99%** uptime for GitHub Actions runner
- **< 30 seconds** for Tailscale connectivity establishment

### Qualitative Metrics
- Infrastructure changes tracked in version control
- Team confidence in infrastructure automation
- Simplified environment management procedures
- Enhanced security through automated provisioning

## Deliverables

### Phase 2 Outputs
- [x] Complete Terraform configuration for all environments
- [x] Functional GitHub Actions self-hosted runner
- [x] Development cloud environment (LXC)
- [x] Production cloud environment (LXC)
- [x] Tailscale network integration
- [ ] Backup and monitoring configuration (moved to Phase 3, Story 0)
- [x] Security hardening implementation
- [x] Infrastructure documentation and runbooks
- [ ] Virtual smoker device (deferred to Phase 4, Story 0)

### Handoff to Phase 3
- ✅ All core infrastructure environments provisioned and accessible
- ✅ GitHub runner capable of executing Terraform deployments
- ✅ Tailscale networking functional for all cloud environments
- ⏸️ Backup procedures (implemented in Phase 3, Story 0)
- ⏸️ Virtual smoker device (deferred to Phase 4)

## Next Phase Preparation

### Prerequisites for Phase 3 ✅ COMPLETE
- [x] Core infrastructure environments operational
- [x] GitHub runner successfully executing workflows
- [x] Tailscale networking functional
- [x] Infrastructure provisioning documented

**Ready to proceed to Phase 3**: YES ✅

---

**Phase Owner**: DevOps Team
**Status**: ✅ Complete (3/4 stories)
**Completion Date**: November 25, 2025
**Dependencies**: Phase 1 completion ✅
**Risk Level**: Low (core infrastructure stable)
