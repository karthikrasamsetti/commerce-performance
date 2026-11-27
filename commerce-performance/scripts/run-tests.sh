#!/bin/sh
# Managed by PerfAgent - regenerated on every export, edit environments/ and config/ instead.
#
# Usage:  sh scripts/run-tests.sh [test-name|all] [environment] [tier]
#   sh scripts/run-tests.sh all dev              # full load from the approved plans
#   sh scripts/run-tests.sh all dev smoke        # 1 user per journey, 30 seconds
#   sh scripts/run-tests.sh checkout-peak uat load
#
# Exit code: 0 = every test passed its thresholds, 1 = a test failed or errored,
# 2 = bad arguments. CI uses this exit code to pass or fail the build.
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
  export PERF_TEST="$t"
  echo "=== $t (environment: $ENVIRONMENT, tier: $TIER) ==="
  if [ "${PERFAGENT_COLLECT_EVIDENCE:-0}" = 1 ]; then
    python3 scripts/collect_k6.py "$t" "$ENVIRONMENT"
  else
    k6 run --summary-trend-stats "avg,min,med,max,p(90),p(95),p(99)" --summary-export "results/$t-summary.json" "tests/$t/loadtest.js"
  fi
  rc=$?
  case $rc in
    0)  echo "PASS   $t" ;;
    99) echo "FAIL   $t - thresholds breached"; status=1 ;;
    *)  echo "ERROR  $t - k6 exited with code $rc"; status=1 ;;
  esac
done
exit $status
