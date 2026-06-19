# Remote state in Terraform Cloud (HCP). Org + workspace are supplied via env
# so nothing environment-specific is hardcoded here:
#   TF_CLOUD_ORGANIZATION   (CI: vars.TF_CLOUD_ORGANIZATION; local: export it)
#   TF_WORKSPACE            = smart-smoker-proxmox
# Auth: TF_TOKEN_app_terraform_io (CI: secrets.TF_API_TOKEN; local: `terraform login`).
#
# IMPORTANT: the workspace Execution Mode MUST be "Local". Plan/apply run on the
# self-hosted proxmox runner because the bpg/proxmox provider needs tailnet
# access to the Proxmox host — Terraform Cloud's remote runners cannot reach it.
# TFC is used for state storage + locking only.
terraform {
  cloud {}
}
