#!/bin/sh
# Managed by PerfAgent - regenerated on every export.
#
# Usage:  sh scripts/validate-tests.sh [test-name|all] [environment] [tier]
# Runs `k6 inspect` on each test: checks the script, lib/ imports, config/<env>.json,
# required secrets and the tier's options. Sends no traffic. CI runs it before tests.
set -u
cd "$(dirname "$0")/.." || exit 2

TEST="${1:-all}"
ENVIRONMENT="${2:-dev}"
case "$TEST$ENVIRONMENT" in */*|*..*|*\\*) echo "Invalid test or environment name" >&2; exit 2 ;; esac

ENV_FILE="environments/${ENVIRONMENT}.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "Environment file not found: $ENV_FILE" >&2
  exit 2
fi

# Load KEY=VALUE lines. Values already set (e.g. CI secrets) are not overridden.
while IFS= read -r line || [ -n "$line" ]; do
  line=$(printf '%s' "$line" | tr -d '\r')
  case "$line" in ''|'#'*) continue ;; esac
  key=${line%%=*}
  value=${line#*=}
  case "$key" in ''|[0-9]*|*[!A-Za-z0-9_]*) echo "Skipping invalid line in $ENV_FILE" >&2; continue ;; esac
  eval "current=\${$key:-}"
  if [ -z "$current" ]; then export "$key=$value"; fi
done < "$ENV_FILE"

# Tier: third argument, else PERF_TIER, else "load". config/<env>.json defines tiers.
TIER="${3:-${PERF_TIER:-load}}"
case "$TIER" in ''|*[!A-Za-z0-9_-]*) echo "Invalid tier: $TIER" >&2; exit 2 ;; esac
export PERF_ENV="$ENVIRONMENT" PERF_TIER="$TIER"

command -v k6 >/dev/null 2>&1 || { echo "k6 is not on PATH" >&2; exit 2; }
mkdir -p results

if [ "$TEST" = "all" ]; then
  TESTS=$(ls tests)
else
  TESTS=$TEST
fi

status=0
for t in $TESTS; do
  if [ ! -f "tests/$t/loadtest.js" ]; then
    echo "No such test: $t" >&2
    status=1
    continue
  fi
  if PERF_TEST="$t" k6 inspect --include-system-env-vars "tests/$t/loadtest.js" >/dev/null; then
    echo "VALID    $t (environment: $ENVIRONMENT, tier: $TIER)"
  else
    echo "INVALID  $t - k6 could not load the script; see the error above"
    status=1
  fi
done
exit $status
