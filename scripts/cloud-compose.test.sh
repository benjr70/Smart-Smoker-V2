#!/usr/bin/env bash
# Tests for cloud.docker-compose.yml hardening (issue #219).
#
# These tests assert the security-relevant network contract of the shared cloud
# compose file. The original posture published MongoDB on all interfaces
# (`27017:27017`), exposing the database to the host's public network. We harden
# it to a loopback-only publish (`127.0.0.1:27017:27017`) so the port is only
# reachable from the host itself; the backend continues to reach mongo over the
# compose network via DNS (`mongo:27017`), which is unaffected by the publish
# binding.
#
# We parse the YAML directly rather than spinning up Docker so the test is fast,
# hermetic, and runnable in CI without a daemon.
#
# Run: bash scripts/cloud-compose.test.sh
# Or:  ./scripts/cloud-compose.test.sh

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMPOSE_FILE="${REPO_ROOT}/cloud.docker-compose.yml"

TESTS_RUN=0
TESTS_FAILED=0
FAILED_NAMES=()

pass() {
    TESTS_RUN=$((TESTS_RUN + 1))
    echo "  PASS: $1"
}

fail() {
    TESTS_RUN=$((TESTS_RUN + 1))
    TESTS_FAILED=$((TESTS_FAILED + 1))
    FAILED_NAMES+=("$1")
    echo "  FAIL: $1"
    if [ -n "${2:-}" ]; then
        echo "    $2"
    fi
}

# Preconditions
if [ ! -f "${COMPOSE_FILE}" ]; then
    echo "FATAL: ${COMPOSE_FILE} not found"
    exit 2
fi

# Extract the `ports:` list entries that belong to the `mongo:` service.
# Strategy: stream the file, track when we are inside the `mongo:` service
# block (a top-level, 2-space-indented service key) and, within it, when we are
# inside that service's `ports:` list. Emit each `- <mapping>` line's mapping.
# We stop collecting once a new 2-space service key begins.
mongo_port_mappings() {
    awk '
        # A service header is exactly two spaces of indent then "<name>:".
        /^  [a-zA-Z0-9_-]+:[[:space:]]*$/ {
            svc = ($0 ~ /^  mongo:[[:space:]]*$/) ? 1 : 0
            in_ports = 0
            next
        }
        # The ports key inside a service is four spaces of indent.
        svc && /^    ports:[[:space:]]*$/ {
            in_ports = 1
            next
        }
        # Any other four-space key ends the ports list for this service.
        svc && in_ports && /^    [a-zA-Z0-9_-]+:/ {
            in_ports = 0
        }
        # List items under ports are six spaces of indent then "- <mapping>".
        svc && in_ports && /^      - / {
            line = $0
            sub(/^      - /, "", line)
            gsub(/[[:space:]]/, "", line)
            # Strip surrounding quote characters (double=octal 042, single=047).
            gsub(/[\042\047]/, "", line)
            print line
        }
    ' "${COMPOSE_FILE}"
}

#-------------------------------------------------------------------------------
# Test (AC 1): mongo must be published on loopback only.
# The exact mapping must be 127.0.0.1:27017:27017 and there must be no mapping
# that publishes 27017 on all interfaces.
#-------------------------------------------------------------------------------
test_mongo_bound_to_loopback() {
    echo "TEST: mongo port is published on 127.0.0.1 only"

    local mappings
    mappings="$(mongo_port_mappings)"

    if [ -z "${mappings}" ]; then
        fail "could not find any mongo ports mapping" \
             "parser returned nothing — check service/ports indentation"
        return
    fi

    if ! printf '%s\n' "${mappings}" | grep -qx "127.0.0.1:27017:27017"; then
        fail "mongo must publish exactly 127.0.0.1:27017:27017" \
             "found mappings: $(printf '%s' "${mappings}" | tr '\n' ' ')"
        return
    fi

    # Guard against an all-interfaces publish lingering alongside the loopback
    # one (e.g. a bare "27017:27017" or "0.0.0.0:27017:27017").
    if printf '%s\n' "${mappings}" | grep -Eqx '(0\.0\.0\.0:)?27017:27017'; then
        fail "mongo must not publish 27017 on all interfaces" \
             "found an unscoped mapping: $(printf '%s' "${mappings}" | tr '\n' ' ')"
        return
    fi

    pass "mongo port is published on 127.0.0.1 only"
}

#-------------------------------------------------------------------------------
# Test (AC 2/3): the backend reaches mongo over the compose network by DNS name,
# independent of the publish binding. Hardening the publish must not touch the
# in-network connection string. This locks the regression: a careless change
# that swapped the DNS host for a published address would break the deploy.
#-------------------------------------------------------------------------------
test_backend_uses_compose_network_dns() {
    echo "TEST: backend connects to mongo over the compose network (mongo:27017)"

    if ! grep -q 'DB_URL=mongodb://[^@]*@mongo:27017/' "${COMPOSE_FILE}"; then
        fail "backend DB_URL must target the compose DNS name mongo:27017" \
             "the in-network connection string is unaffected by the publish binding"
        return
    fi

    pass "backend connects to mongo over the compose network (mongo:27017)"
}

#-------------------------------------------------------------------------------
# Run suite
#-------------------------------------------------------------------------------
echo "=========================================="
echo "cloud.docker-compose.yml hardening tests"
echo "=========================================="

test_mongo_bound_to_loopback
test_backend_uses_compose_network_dns

echo ""
echo "=========================================="
echo "Ran: ${TESTS_RUN} | Failed: ${TESTS_FAILED}"
echo "=========================================="

if [ "${TESTS_FAILED}" -gt 0 ]; then
    echo "Failed tests:"
    for name in "${FAILED_NAMES[@]}"; do
        echo "  - ${name}"
    done
    exit 1
fi

exit 0
