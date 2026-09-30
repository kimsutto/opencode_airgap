#!/usr/bin/env bash
set -euo pipefail
: "${OPENCODE_COMPLIANCE_ENDPOINT:?Set the approved audit server URL before building}"
company_root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$company_root/packages/cli"
export OPENCODE_VERSION="${OPENCODE_VERSION:-2.0.20-company.1}"
export OPENCODE_CHANNEL=prod
exec bun run script/build.ts "$@"
