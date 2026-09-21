#!/usr/bin/env bash
# Deploys one commit of both services to Render, smoke tests it and rolls back
# to the previously running commit if anything fails.
#
# Usage: scripts/deploy.sh <commit-sha>
# Reads LOCATIONS_URL, PROPERTIES_URL, LOCATIONS_SERVICE_ID,
# PROPERTIES_SERVICE_ID and RENDER_API_KEY from the environment.
set -euo pipefail

target=${1:?Usage: deploy.sh <commit-sha>}
: "${LOCATIONS_SERVICE_ID:?}" "${PROPERTIES_SERVICE_ID:?}" "${RENDER_API_KEY:?}" \
  "${LOCATIONS_URL:?}" "${PROPERTIES_URL:?}"
here=$(dirname "$0")

# The commit Render serves right now is where a failed deploy goes back to.
# Asking Render rather than /health works even while the instance sleeps. Both
# services always move together, so locations stands for both.
previous=$(render deploys list "$LOCATIONS_SERVICE_ID" --confirm -o json |
  jq -r '[.[] | .deploy // . | select(.status == "live")][0].commit.id // empty')
if [[ -z $previous ]]; then
  echo "::warning::Render reports no live deploy, a failure cannot be rolled back"
fi
echo "Currently live: ${previous:-none}. Deploying: $target"

deploy_all() {
  # Locations first, because properties calls it.
  render deploys create "$LOCATIONS_SERVICE_ID" --commit "$1" --wait --confirm -o text &&
    render deploys create "$PROPERTIES_SERVICE_ID" --commit "$1" --wait --confirm -o text
}

# Render only switches traffic once the new instance passes /health/ready, so a
# deploy that fails here has left the old version serving.
if deploy_all "$target" && "$here/smoke-test.sh" "$target"; then
  echo "Deployed $target"
  exit 0
fi

echo "::error::Deploy of $target failed"
if [[ -z $previous || $previous == "$target" ]]; then
  echo "::error::No earlier version to roll back to, fix forward"
  exit 1
fi

echo "Rolling back to $previous"
deploy_all "$previous"
"$here/smoke-test.sh" "$previous"
echo "::warning::Rolled back to $previous"
exit 1
