#!/bin/bash
# Creates one schema and one dedicated role per microservice.
#
# The course rules require that the properties service never reads locality data
# straight from the database. We enforce that here instead of relying on
# discipline: properties_user simply has no privileges on the locations schema.
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-SQL
    CREATE ROLE locations_user LOGIN PASSWORD '${LOCATIONS_DB_PASSWORD}';
    CREATE ROLE properties_user LOGIN PASSWORD '${PROPERTIES_DB_PASSWORD}';

    CREATE SCHEMA locations AUTHORIZATION locations_user;
    CREATE SCHEMA properties AUTHORIZATION properties_user;

    -- Nobody gets access to the other service's schema.
    REVOKE ALL ON SCHEMA locations FROM properties_user;
    REVOKE ALL ON SCHEMA properties FROM locations_user;

    GRANT CONNECT ON DATABASE ${POSTGRES_DB} TO locations_user, properties_user;

    ALTER ROLE locations_user SET search_path TO locations;
    ALTER ROLE properties_user SET search_path TO properties;
SQL
