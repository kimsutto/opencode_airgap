#!/bin/bash
set -euo pipefail
company_bundle="$(cd "$(dirname "$0")" && pwd)"
company_profile="${OPENCODE_COMPANY_HOME:-$HOME/.local/share/opencode-company/v1}"
mkdir -p "$company_profile"/{data,config,cache,state,tmp,home}
export PATH="$company_bundle:$PATH"
export XDG_DATA_HOME="$company_profile/data"
export XDG_CONFIG_HOME="$company_profile/config"
export XDG_CACHE_HOME="$company_profile/cache"
export XDG_STATE_HOME="$company_profile/state"
export TMPDIR="$company_profile/tmp"
export OPENCODE_TEST_HOME="$company_profile/home"
export OPENCODE_CONFIG_DIR="$company_bundle/config"
export OPENCODE_DISABLE_AUTOUPDATE=true
export OPENCODE_DISABLE_MODELS_FETCH=true
export OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS=true
if [[ $# -gt 0 ]]; then
  exec "$company_bundle/opencode" "$@"
fi
printf 'Project folder (Enter = home): '
read -r company_project
company_project="${company_project:-$HOME}"
if [[ ! -d "$company_project" ]]; then
  printf 'Folder not found: %s\n' "$company_project"
  read -r -p 'Press Enter to close.'
  exit 1
fi
exec "$company_bundle/opencode" "$company_project"
