#!/usr/bin/env bash
set -euo pipefail
company_root="$(cd "$(dirname "$0")/../.." && pwd)"
company_state="${OPENCODE_COMPANY_HOME:-$HOME/.local/share/opencode-company/v2}"
mkdir -p "$company_state"/{data,config,cache,state,tmp,home}
export XDG_DATA_HOME="$company_state/data"
export XDG_CONFIG_HOME="$company_state/config"
export XDG_CACHE_HOME="$company_state/cache"
export XDG_STATE_HOME="$company_state/state"
export TMPDIR="$company_state/tmp"
export OPENCODE_TEST_HOME="$company_state/home"
export OPENCODE_CONFIG_DIR="$company_state/config/opencode"
export OPENCODE_DISABLE_AUTOUPDATE=true
company_binary="${OPENCODE_COMPANY_BINARY:-$company_root/packages/cli/dist/cli-darwin-arm64/bin/opencode}"
if [[ ! -x "$company_binary" ]]; then
  echo "Build the company binary first; see docs/company/trial.ko.md" >&2
  exit 1
fi
exec "$company_binary" "$@"
