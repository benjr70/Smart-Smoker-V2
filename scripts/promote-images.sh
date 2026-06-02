#!/usr/bin/env bash
# Promotes :nightly images to a versioned release tag without rebuilding.
# Usage: promote-images.sh <version>
#   version  e.g. 1.2.3, v1.2.3, V1.2.3 — normalized to vX.Y.Z

set -euo pipefail

REGISTRY_USER="benjr70"
BACKEND_IMAGE="${REGISTRY_USER}/smart-smoker-backend"
FRONTEND_IMAGE="${REGISTRY_USER}/smart-smoker-frontend"

usage() {
    echo "Usage: $(basename "$0") <version>" >&2
    echo "  version must match X.Y.Z (with optional v/V prefix)" >&2
    exit 1
}

# Normalize: strip leading v/V, then prepend lowercase v
normalize_version() {
    local raw="$1"
    local stripped="${raw#[vV]}"
    if ! [[ "${stripped}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        echo "Error: invalid version '${raw}' — expected X.Y.Z" >&2
        exit 1
    fi
    echo "v${stripped}"
}

main() {
    if [ "${#}" -lt 1 ] || [ -z "${1:-}" ]; then
        usage
    fi

    local version
    version="$(normalize_version "$1")"

    for image in "${BACKEND_IMAGE}" "${FRONTEND_IMAGE}"; do
        docker buildx imagetools create \
            --tag "${image}:${version}" \
            --tag "${image}:latest" \
            "${image}:nightly"
    done
}

main "$@"
