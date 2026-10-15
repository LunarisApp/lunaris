#!/bin/bash
set -euo pipefail
umask 077
: "${PUBLIC_URL:=http://localhost:8080}"
export PUBLIC_URL
# Reject unsafe template input and HTTP origins unusable for browser crypto.
python3 - <<'PY'
import os, re
from urllib.parse import urlsplit
value = os.environ['PUBLIC_URL']
u = urlsplit(value)
if not re.fullmatch(r'https?://[a-zA-Z0-9.\-]+(:[0-9]+)?', value):
    raise SystemExit('PUBLIC_URL must be an HTTP(S) origin without a path or trailing slash')
if u.scheme == 'http' and u.hostname not in ('localhost', '127.0.0.1'):
    raise SystemExit('Non-localhost deployments require an HTTPS PUBLIC_URL')
PY
mkdir -p /data /run/lunaris
chmod 700 /data
# One owner per volume; never start two PostgreSQL processes against it.
exec 9>/data/.lock
flock -n 9 || { echo 'Data volume already in use' >&2; exit 1; }
if [[ ! -f /data/secrets.env ]]; then
  if [[ -f /data/postgres/PG_VERSION ]]; then
    echo 'Existing database has no secrets.env; restore the complete backup' >&2; exit 1
  fi
  {
    for key in DATABASE_PASSWORD REDIS_PASSWORD AUDIT_LOG_HMAC_SECRET BETTER_AUTH_SECRET LOCAL_DB_ENCRYPTION_MASTER_KEY AWS_SECRET_ACCESS_KEY GARAGE_RPC_SECRET; do
      printf 'export %s=%s\n' "$key" "$(openssl rand -hex 32)"
    done
    printf 'export AWS_ACCESS_KEY_ID=GK%s\n' "$(openssl rand -hex 12)"
  } > /data/secrets.env.tmp
  chmod 600 /data/secrets.env.tmp
  mv /data/secrets.env.tmp /data/secrets.env
fi
source /data/secrets.env
export DATABASE_HOST=127.0.0.1 DATABASE_PORT=5432 DATABASE_USER=lunaris DATABASE_NAME=lunaris DATABASE_SSL=false
export REDIS_HOST=127.0.0.1 REDIS_PORT=6379
export AWS_ENDPOINT_URL=http://127.0.0.1:3900 AWS_PUBLIC_ENDPOINT_URL="$PUBLIC_URL" AWS_DEFAULT_REGION=garage AWS_S3_BUCKET=lunaris
export URL="$PUBLIC_URL" FRONTEND_URL="$PUBLIC_URL" POWERSYNC_URL="$PUBLIC_URL/sync" APP_REGION=selfhost PORT=3000
export API_BIND_ADDRESS=127.0.0.1
export PS_AUTH_AUD="$POWERSYNC_URL"
export PS_POSTGRES_SOURCE_URL="postgresql://powersync:$DATABASE_PASSWORD@127.0.0.1:5432/lunaris"
export PS_POSTGRES_BUCKET_URL="postgresql://powersync:$DATABASE_PASSWORD@127.0.0.1:5432/powersync_storage"
export EMAIL_VERIFICATION_DISABLED="${EMAIL_VERIFICATION_DISABLED:-true}"
export NODE_ENV=production DEPLOYMENT_MODE=self-hosted
mkdir -p /data/postgres /data/redis /data/garage /var/run/postgresql
chown postgres:postgres /data/postgres /var/run/postgresql
chown redis:redis /data/redis
chown lunaris:lunaris /data/garage
# Allow service users to traverse the volume; each service directory stays private.
chmod 711 /data
chmod 700 /data/postgres /data/redis /data/garage
if [[ ! -f /data/postgres/PG_VERSION ]]; then
  gosu postgres /usr/lib/postgresql/*/bin/initdb -D /data/postgres --auth-local=peer --auth-host=scram-sha-256
fi
installed_major=$(/usr/lib/postgresql/*/bin/postgres --version | sed -E 's/.* ([0-9]+).*/\1/')
[[ $(cat /data/postgres/PG_VERSION) == "$installed_major" ]] || { echo 'PostgreSQL major mismatch; migrate before upgrading image' >&2; exit 1; }
cat > /run/lunaris/redis.conf <<REDIS
bind 127.0.0.1
port 6379
protected-mode yes
requirepass $REDIS_PASSWORD
dir /data/redis
appendonly yes
appendfsync everysec
REDIS
chown redis:redis /run/lunaris/redis.conf
cat > /run/lunaris/garage.toml <<GARAGE
metadata_dir = "/data/garage/meta"
data_dir = "/data/garage/data"
db_engine = "sqlite"
replication_factor = 1
rpc_bind_addr = "127.0.0.1:3901"
rpc_public_addr = "127.0.0.1:3901"
rpc_secret = "$GARAGE_RPC_SECRET"
[s3_api]
s3_region = "garage"
api_bind_addr = "127.0.0.1:3900"
GARAGE
chown lunaris:lunaris /run/lunaris/garage.toml
python3 - <<'PY'
import json, os
from urllib.parse import urlsplit
url = os.environ['PUBLIC_URL']
with open('/run/lunaris/regions.json', 'w') as f:
    json.dump(dict(schemaVersion=1, regions=[dict(regionId='selfhost', displayName='Self-hosted', manifestUrl=url + '/v1/manifest', status='available')]), f)
os.chmod('/run/lunaris/regions.json', 0o644)
with open('/run/lunaris/servers.json', 'w') as f:
    json.dump(dict(schemaVersion=1, servers=[dict(serverId='selfhost', displayName='Self-hosted', manifestUrl=url + '/v1/manifest', status='available')]), f)
os.chmod('/run/lunaris/servers.json', 0o644)
with open('/run/lunaris/proxy-headers.conf', 'w') as f:
    f.write('proxy_set_header Host $http_host;\nproxy_set_header X-Forwarded-For $remote_addr;\n')
    f.write(f'proxy_set_header X-Forwarded-Proto {urlsplit(url).scheme};\n')
with open('/run/lunaris/presence-origin.conf', 'w') as f:
    ws_scheme = 'wss' if urlsplit(url).scheme == 'https' else 'ws'
    f.write(f'set $presence_origin {ws_scheme}://{urlsplit(url).netloc};\n')
with open('/run/lunaris/canonical-origin.conf', 'w') as f:
    f.write(f'if ($http_host != "{urlsplit(url).netloc}") {{ return 307 {url}$request_uri; }}\n')
PY
supervisord -c /opt/aio/supervisord.conf &
supervisor_pid=$!
shutdown() {
  trap '' TERM INT
  kill -TERM "$supervisor_pid" 2>/dev/null || true
  wait "$supervisor_pid" || true
}
trap 'shutdown; exit 0' TERM INT
trap shutdown EXIT
wait_for() {
  local attempt
  for attempt in {1..120}; do
    if "$@"; then return; fi
    kill -0 "$supervisor_pid" || return 1
    sleep 1
  done
  echo 'Service readiness timed out' >&2
  return 1
}
wait_for pg_isready -q -h 127.0.0.1 -U postgres
# Names are fixed; passwords are generated hex, never interpolated user input.
gosu postgres psql -v ON_ERROR_STOP=1 <<SQL
SELECT 'CREATE ROLE lunaris LOGIN' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname='lunaris')\gexec
ALTER ROLE lunaris PASSWORD '$DATABASE_PASSWORD';
SELECT 'CREATE ROLE powersync LOGIN REPLICATION' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname='powersync')\gexec
ALTER ROLE powersync PASSWORD '$DATABASE_PASSWORD';
SELECT 'CREATE DATABASE lunaris OWNER lunaris' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname='lunaris')\gexec
SELECT 'CREATE DATABASE powersync_storage OWNER powersync' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname='powersync_storage')\gexec
SQL
(cd /opt/lunaris/apps/api && gosu lunaris bun aio-migrate.ts)
gosu postgres psql -v ON_ERROR_STOP=1 -d lunaris <<'SQL'
GRANT USAGE ON SCHEMA public TO powersync;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO powersync;
ALTER DEFAULT PRIVILEGES FOR ROLE lunaris IN SCHEMA public GRANT SELECT ON TABLES TO powersync;
SQL
wait_for garage -c /run/lunaris/garage.toml status
# Layout/key/bucket initialization resumes safely after interrupted first boots.
garage_cmd=(garage -c /run/lunaris/garage.toml)
layout=$("${garage_cmd[@]}" layout show)
if echo "$layout" | grep -q "Current cluster layout version: 0"; then
  node_id=$("${garage_cmd[@]}" node id | cut -d@ -f1)
  "${garage_cmd[@]}" layout assign -z local -c 1T "$node_id"
  "${garage_cmd[@]}" layout apply --version 1
fi
if ! "${garage_cmd[@]}" key info "$AWS_ACCESS_KEY_ID" >/dev/null 2>&1; then
  "${garage_cmd[@]}" key import --yes -n lunaris "$AWS_ACCESS_KEY_ID" "$AWS_SECRET_ACCESS_KEY" >/dev/null
fi
if ! "${garage_cmd[@]}" bucket info lunaris >/dev/null 2>&1; then
  "${garage_cmd[@]}" bucket create lunaris
fi
"${garage_cmd[@]}" bucket allow --read --write --owner lunaris --key "$AWS_ACCESS_KEY_ID"
supervisorctl -c /opt/aio/supervisord.conf start api
wait_for curl -fsS -o /dev/null http://127.0.0.1:3000/auth/jwks
# Sync readiness must not tear down healthy services, including during startup.
supervisorctl -c /opt/aio/supervisord.conf start powersync || echo 'PowerSync start failed; recovery will retry' >&2
supervisorctl -c /opt/aio/supervisord.conf start watchdog
echo "Lunaris services started at $PUBLIC_URL; healthcheck reports readiness"
# Supervisor owns process exits. Readiness failures never stop the stack.
wait "$supervisor_pid" || true
exit 1
