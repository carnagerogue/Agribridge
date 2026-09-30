#!/bin/sh
set -eu

# Invoked only when the official PostgreSQL image initializes an empty data volume.
# The password is prepared by the container entrypoint and never printed.
app_password=$(cat /tmp/postgres-bootstrap/app-password)
if [ "${#app_password}" -lt 24 ]; then
  printf '%s\n' 'The application database password must have at least 24 characters.' >&2
  exit 1
fi
psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set=ON_ERROR_STOP=1 --set=app_password="$app_password" <<'SQL'
CREATE ROLE agribridge_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD :'app_password';
GRANT CONNECT ON DATABASE agribridge TO agribridge_app;
GRANT USAGE, CREATE ON SCHEMA public TO agribridge_app;
SQL
unset app_password
