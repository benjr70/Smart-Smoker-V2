output "github_runner_vmid" {
  description = "VMID of the GitHub runner container"
  value       = var.github_runner.enabled ? module.github_runner[0].vmid : null
}

output "dev_cloud_vmid" {
  description = "VMID of the development cloud container"
  value       = var.dev_cloud.enabled ? module.dev_cloud[0].vmid : null
}

output "prod_cloud_vmid" {
  description = "VMID of the production cloud container"
  value       = var.prod_cloud.enabled ? module.prod_cloud[0].vmid : null
}

output "virtual_smoker_vmid" {
  description = "VMID of the virtual smoker VM"
  value       = var.virtual_smoker.enabled ? module.virtual_smoker[0].vmid : null
}
