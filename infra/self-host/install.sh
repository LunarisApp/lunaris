#!/usr/bin/env bash
set -Eeuo pipefail
set +x
umask 077
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

fail() { echo "$*" >&2; exit 1; }
[[ $# -le 1 ]] || fail 'Usage: ./install.sh [PUBLIC_URL]'
for command in docker openssl curl sed grep cut cat; do
  command -v "$command" >/dev/null || fail "Missing $command. Install Docker Engine/Compose, OpenSSL, curl and standard Unix tools."
done
docker info >/dev/null 2>&1 || fail 'Docker daemon unavailable or access denied.'
compose_version=$(docker compose version --short) || fail 'Docker Compose v2 is required.'
IFS=. read -r compose_major compose_minor _ <<< "${compose_version#v}"
[[ $compose_major =~ ^[0-9]+$ && $compose_minor =~ ^[0-9]+$ ]] || fail 'Cannot parse Docker Compose version.'
[[ $compose_major -gt 2 || ($compose_major -eq 2 && $compose_minor -ge 24) ]] || fail 'Docker Compose 2.24 or later is required.'
# Compose reads project names from .env too. Keep installer commands and the
# operator's ordinary `docker compose` commands on the same persistent volumes.
stored_project=
if [[ -f .env ]]; then
  stored_project=$(sed -n 's/^COMPOSE_PROJECT_NAME=//p' .env)
fi
project=${COMPOSE_PROJECT_NAME:-${stored_project:-lunaris-self-host}}
[[ "$project" =~ ^[a-z0-9][a-z0-9_-]*$ ]] || fail 'Invalid COMPOSE_PROJECT_NAME.'
compose() { docker compose --project-name "$project" "$@"; }
# A directory lock works on both Linux and macOS, without flock.
mkdir .install.lock 2>/dev/null || fail 'Installer already running. Remove .install.lock only after confirming no installer is active.'
cleanup() { rmdir .install.lock 2>/dev/null || true; }
trap cleanup EXIT
trap 'echo "Installation failed. Run: docker compose ps --all; docker compose logs --tail=100" >&2' ERR

if [[ ! -f .env ]]; then
  volumes=$(docker volume ls --filter "label=com.docker.compose.project=$project" --format '{{.Name}}')
  [[ -z "$volumes" ]] || fail 'Existing installation volumes found without .env. Restore configuration/secrets from backup; do not generate replacements.'
  origin=${1:-}
  if [[ -z "$origin" ]]; then
    # A piped bootstrap owns stdin. Read the operator's terminal explicitly.
    { exec 3<>/dev/tty; } 2>/dev/null || fail 'No terminal available. Pass a public URL: ./install.sh https://notes.example.com'
    printf 'Domain or public URL (notes.example.com): ' >&3
    IFS= read -r origin <&3 || fail 'No public URL provided.'
    exec 3>&-
    [[ -n "$origin" ]] || fail 'No public URL provided.'
    [[ "$origin" == *://* ]] || origin="https://$origin"
  fi
  [[ -n "$origin" ]] || fail 'First install requires ./install.sh https://notes.example.com'
else
  # Read this one non-secret setting without executing the operator's .env as shell.
  origin=$(sed -n 's/^PUBLIC_URL=//p' .env)
  [[ -n "$origin" && "$origin" != *$'\n'* ]] || fail 'Set exactly one PUBLIC_URL=origin in .env (without quotes).'
  [[ -z ${1:-} || $1 == "$origin" ]] || fail 'PUBLIC_URL differs from .env. Edit .env explicitly to change the installation origin.'
fi
# A public deployment uses standard HTTPS. HTTP is supported only for localhost.
if [[ "$origin" =~ ^https://[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$ ]]; then
  [[ "$origin" != https://localhost && "$origin" != https://127.0.0.1 ]] || fail 'Use an HTTPS domain, or http://localhost:8080 for local evaluation.'
elif [[ "$origin" =~ ^http://(localhost|127\.0\.0\.1)(:([0-9]+))?$ ]]; then
  port=${BASH_REMATCH[3]:-80}
  [[ $port -gt 0 && $port -lt 65536 ]] || fail 'Invalid localhost port.'
else
  fail 'PUBLIC_URL must be https://domain (no path/trailing slash), or http://localhost:port.'
fi
[[ ${PUBLIC_URL:-$origin} == "$origin" ]] || fail 'PUBLIC_URL environment conflicts with .env. Unset it before running installer.'
if [[ ! -f .env ]]; then
  {
    printf 'PUBLIC_URL=%s\n' "$origin"
    printf 'COMPOSE_PROJECT_NAME=%s\n' "$project"
    printf 'SIGNUPS_ALLOWED=true\nEMAIL_VERIFICATION_DISABLED=true\n'
    if [[ $origin == http://* ]]; then
      printf 'BIND_ADDRESS=127.0.0.1\nHTTP_PORT=%s\n' "$port"
    fi
    for key in POSTGRES_PASSWORD DATABASE_PASSWORD POWERSYNC_PASSWORD REDIS_PASSWORD BETTER_AUTH_SECRET LOCAL_DB_ENCRYPTION_MASTER_KEY AUDIT_LOG_HMAC_SECRET AWS_SECRET_ACCESS_KEY GARAGE_RPC_SECRET; do
      printf '%s=%s\n' "$key" "$(openssl rand -hex 32)"
    done
    printf 'AWS_ACCESS_KEY_ID=GK%s\n' "$(openssl rand -hex 12)"
  } > .env.tmp
  chmod 600 .env.tmp
  mv .env.tmp .env
fi
chmod 600 .env
# PostgreSQL provisioning and connection URIs use generated, hex-only secrets.
for key in POSTGRES_PASSWORD DATABASE_PASSWORD POWERSYNC_PASSWORD REDIS_PASSWORD BETTER_AUTH_SECRET LOCAL_DB_ENCRYPTION_MASTER_KEY AUDIT_LOG_HMAC_SECRET AWS_SECRET_ACCESS_KEY GARAGE_RPC_SECRET; do
  value=$(sed -n "s/^$key=//p" .env)
  [[ ${!key:-$value} == "$value" ]] || fail "$key environment conflicts with .env. Unset it before running installer."
  [[ "$value" =~ ^[0-9a-fA-F]{64}$ ]] || fail "$key must contain the original 64 hex characters. Restore missing secrets from backup."
done
value=$(sed -n 's/^AWS_ACCESS_KEY_ID=//p' .env)
[[ ${AWS_ACCESS_KEY_ID:-$value} == "$value" ]] || fail 'AWS_ACCESS_KEY_ID environment conflicts with .env. Unset it before running installer.'
[[ "$value" =~ ^GK[0-9a-fA-F]{24}$ ]] || fail 'AWS_ACCESS_KEY_ID missing or invalid. Restore it from backup.'
compose config --quiet

# Pull and validate before touching a running installation. For local development,
# use a Compose override with pull_policy: never; release images are digest-pinned.
echo 'Pulling release images...'
compose pull --policy missing
# shellcheck disable=SC2016 # These variables expand inside the container.
compose run --rm --no-deps --entrypoint /bin/sh web -ec '
  export CADDY_SITE_ADDRESS="${PUBLIC_URL%%://*}://${PUBLIC_URL#*://}"
  export PUBLIC_AUTHORITY="${PUBLIC_URL#*://}" PUBLIC_SCHEME="${PUBLIC_URL%%://*}"
  export PRESENCE_ORIGIN="$(printf %s "$PUBLIC_URL" | sed s/^http/ws/)"
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
'
# Docker's bind is authoritative; check ports before entering upgrade downtime.
# Exclude this project's running web container from the probe on upgrades.
if [[ -z $(compose ps --status running -q web) ]]; then
  compose run --rm --no-deps --service-ports --entrypoint /bin/sh web -c true
fi

echo 'Stopping application services for setup/migrations...'
compose stop web powersync api
compose up -d --wait --wait-timeout 180 postgres redis garage
# Secrets stay on stdin, outside command arguments and installer output.
{
  printf '\\set database_password %s\n' "$(sed -n 's/^DATABASE_PASSWORD=//p' .env)"
  printf '\\set powersync_password %s\n' "$(sed -n 's/^POWERSYNC_PASSWORD=//p' .env)"
  cat postgres-setup.sql
} | compose exec -T postgres psql -X -U postgres -v ON_ERROR_STOP=1 >/dev/null

# Garage is a single node. Its CLI executes inside its own container, so no
# admin API, helper image, or Docker socket mount is needed.
garage() { compose exec -T -e RUST_LOG=warn garage /garage "$@"; }
if garage layout show | grep -q 'Current cluster layout version: 0'; then
  node_id=$(garage node id 2>/dev/null | cut -d@ -f1)
  garage layout assign -z local -c 1T "$node_id" >/dev/null
  garage layout apply --version 1 >/dev/null
fi
access_key=$(sed -n 's/^AWS_ACCESS_KEY_ID=//p' .env)
if ! garage key info "$access_key" >/dev/null 2>&1; then
  # Garage CLI has no stdin import; command runs only within the private
  # container, and its output (including the secret) is suppressed.
  garage key import --yes -n lunaris "$access_key" "$(sed -n 's/^AWS_SECRET_ACCESS_KEY=//p' .env)" >/dev/null
fi
if ! garage bucket info lunaris >/dev/null 2>&1; then
  garage bucket create lunaris >/dev/null
fi
garage bucket allow --read --write --owner lunaris --key "$access_key" >/dev/null

echo 'Migrating application database...'
compose run --rm --no-deps api bun migrate.ts
compose exec -T postgres psql -X -U postgres -d lunaris -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
GRANT USAGE ON SCHEMA public TO powersync;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO powersync;
ALTER DEFAULT PRIVILEGES FOR ROLE lunaris IN SCHEMA public GRANT SELECT ON TABLES TO powersync;
SQL
compose up -d --wait --wait-timeout 300
# Confirm public routing and TLS, not merely that Caddy's process is alive.
curl --fail --silent --show-error --retry 12 --retry-delay 5 --retry-all-errors --max-time 15 "$origin/v1/health" >/dev/null
curl --fail --silent --show-error --max-time 15 "$origin/sync/probes/readiness" >/dev/null
printf '\nLunaris ready: %s\nLogs: docker compose logs --tail=100\n' "$origin"
printf 'Registration: set SIGNUPS_ALLOWED=false in .env and run docker compose up -d when all accounts are created.\n'
