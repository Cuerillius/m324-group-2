#!/usr/bin/env bash
# Checks that both deployed services run the expected version and are ready.
#
# Usage: scripts/smoke-test.sh <expected-commit-sha>
# Reads LOCATIONS_URL and PROPERTIES_URL from the environment.
#
# Free Render instances sleep when idle and take up to a minute to wake, so
# every request gets a long timeout and a few retries.
set -euo pipefail

expected=${1:?Usage: smoke-test.sh <expected-commit-sha>}
: "${LOCATIONS_URL:?}" "${PROPERTIES_URL:?}"

# Prints the body of a 2xx response, retrying while the instance wakes up.
fetch() {
  local url=$1 attempt
  for attempt in 1 2 3 4 5; do
    if curl --silent --show-error --fail --max-time 90 "$url"; then
      return 0
    fi
    echo "  attempt $attempt for $url failed, retrying in 10s" >&2
    sleep 10
  done
  return 1
}

failed=0
for service in locations properties; do
  url_var="${service^^}_URL"
  base=${!url_var}
  echo "== $service ($base)"

  if ! health=$(fetch "$base/health"); then
    echo "FAIL: $base/health did not answer" && failed=1 && continue
  fi
  version=$(jq -r '.version // "none"' <<<"$health")
  if [[ $version != "$expected" ]]; then
    echo "FAIL: running $version, expected $expected" && failed=1 && continue
  fi
  echo "ok: /health reports version $version"

  if ! ready=$(fetch "$base/health/ready"); then
    echo "FAIL: $base/health/ready is not ready" && failed=1 && continue
  fi
  echo "ok: /health/ready $ready"
done

if ((failed)); then
  echo "Smoke test failed"
  exit 1
fi
echo "Smoke test passed for $expected"
