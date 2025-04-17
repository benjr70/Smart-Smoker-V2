# Infrastructure Documentation

This document provides an overview of the Terraform configuration and GitHub Action workflow used to manage the infrastructure for the Smart Smoker project.

## Terraform Configuration

The Terraform configuration is located in the `infra` directory and is responsible for provisioning an LXC container on a Proxmox server. Below is a breakdown of the key components:

### Files

1. **`main.tf`**:
   - Configures the Proxmox provider to interact with the Proxmox server.
   - Defines an LXC container resource with the following specifications:
     - Hostname: `smart-smoker-${var.env_name}` (e.g., `smart-smoker-dev` for the development environment).
     - Memory: 1024 MB.
     - CPU Cores: 2.
     - Storage: 8 GB.
     - Networking: DHCP.
     - Features: Nesting enabled for running Docker inside the container.
     - Post-start script:
       - Installs Docker and Docker Compose.
       - Deploys the `cloud.docker-compose.yml` file to run the necessary services.

2. **`variables.tf`**:
   - Defines variables for:
     - `proxmox_password`: The Proxmox root password.
     - `env_name`: The environment name (e.g., `dev`, `stag`, `prod`).

3. **`outputs.tf`**:
   - Outputs the IP address and hostname of the created LXC container.

### Usage

1. Initialize Terraform:
   ```bash
   terraform init
   ```

2. Plan the infrastructure:
   ```bash
   terraform plan -var="proxmox_password=your_password" -var="env_name=dev"
   ```

3. Apply the configuration:
   ```bash
   terraform apply -auto-approve -var="proxmox_password=your_password" -var="env_name=dev"
   ```

## GitHub Action Workflow

The GitHub Action workflow is defined in `.github/workflows/deploy-dev.yml` and automates the deployment of the latest `master` branch to a development environment.

### Workflow Steps

1. **Trigger**:
   - The workflow runs on every push to the `master` branch.

2. **Steps**:
   - **Checkout Code**: Pulls the latest code from the repository.
   - **Set Up Terraform**: Configures Terraform with version 1.5.0.
   - **Initialize Terraform**: Runs `terraform init` in the `infra` directory.
   - **Plan Terraform**: Executes `terraform plan` with the `dev` environment and Proxmox password from GitHub Secrets.
   - **Apply Terraform**: Applies the Terraform configuration automatically.

### Prerequisites

- Add the `PROXMOX_PASSWORD` secret to your GitHub repository settings.

### Example

To trigger the workflow, push changes to the `master` branch:
```bash
git add .
git commit -m "Deploy to dev environment"
git push origin master
```

This will automatically provision a new development environment on the Proxmox server.

## Summary

The Terraform configuration and GitHub Action workflow streamline the process of provisioning and deploying environments for the Smart Smoker project. By leveraging these tools, you can ensure consistent and automated infrastructure management.
