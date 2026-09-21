#!/bin/bash
# Creates one dedicated role per microservice; each service creates its own schema.
#
# The course rules require that the properties service never reads locality data
# straight from the database. We enforce that here instead of relying on
# discipline: properties_user simply has no privileges on the locations schema.
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-SQL
    CREATE ROLE locations_user LOGIN PASSWORD '${LOCATIONS_DB_PASSWORD}';
    CREATE ROLE properties_user LOGIN PASSWORD '${PROPERTIES_DB_PASSWORD}';

    -- Each service creates and owns its schema through its own migrations. A
    -- schema grants nothing to other roles by default, so properties_user can
    -- never read the locations schema and vice versa. CREATE on the database is
    -- what lets a service create its schema in the first place.
    GRANT CONNECT, CREATE ON DATABASE ${POSTGRES_DB} TO locations_user, properties_user;

    ALTER ROLE locations_user SET search_path TO locations;
    ALTER ROLE properties_user SET search_path TO properties;
SQL
