#!/usr/bin/env bash
# Creates one dedicated role per microservice on Neon.
#
# This mirrors db/init/01-init.sh, which does the same for the local Compose
# Postgres. Keep the two in sync.
#
# Run it once, in your own terminal:
#   db/neon-setup.sh
# It asks for the owner connection string from the Neon dashboard, generates the
# service passwords locally and writes both service connection strings to
# db/.neon.env (gitignored, mode 600). It never prints a secret.
set -euo pipefail

out="$(dirname "$0")/.neon.env"
if [[ -e $out ]]; then
  echo "$out already exists. Delete it first if you really want to run this again." >&2
  exit 1
fi

if [[ -z ${NEON_OWNER_URL:-} ]]; then
  read -rsp 'Neon owner connection string: ' NEON_OWNER_URL
  echo
fi

generate_password() { openssl rand -base64 48 | tr -d '/+=\n' | cut -c1-32; }
locations_password=$(generate_password)
properties_password=$(generate_password)

# One transaction, so a failure leaves nothing half created.
psql "$NEON_OWNER_URL" --single-transaction -v ON_ERROR_STOP=1 --quiet \
  -v locations_password="$locations_password" \
  -v properties_password="$properties_password" <<'SQL'
SELECT current_database() AS db \gset

CREATE ROLE locations_user LOGIN PASSWORD :'locations_password';
CREATE ROLE properties_user LOGIN PASSWORD :'properties_password';

-- Each service creates and owns its schema through its own migrations. A
-- schema grants nothing to other roles by default, so properties_user can
-- never read the locations schema and vice versa. CREATE on the database is
-- what lets a service create its schema in the first place. It also lets a
-- role create any other schema, which we accept: reading another service's
-- data stays impossible, and a stray schema would show up in review.
GRANT CONNECT, CREATE ON DATABASE :"db" TO locations_user, properties_user;

ALTER ROLE locations_user SET search_path TO locations;
ALTER ROLE properties_user SET search_path TO properties;
SQL

# Swap the owner credentials in the connection string for each service role.
service_url() {
  python3 -c '
import sys, urllib.parse as u
url, user, password = sys.argv[1:]
p = u.urlsplit(url)
host = p.hostname + (f":{p.port}" if p.port else "")
print(u.urlunsplit(p._replace(netloc=f"{user}:{u.quote(password, safe=str())}@{host}")))
' "$NEON_OWNER_URL" "$1" "$2"
}

umask 077
{
  # Quoted, because Neon URLs contain "&" and the file is meant to be sourced.
  echo "LOCATIONS_DATABASE_URL='$(service_url locations_user "$locations_password")'"
  echo "PROPERTIES_DATABASE_URL='$(service_url properties_user "$properties_password")'"
} >"$out"

echo "Roles and schemas created. Connection strings are in $out"
