#!/bin/bash
set -euo pipefail
set +x
umask 077
if [[ $# != 3 || $1 != reset-password || $2 != --email || -z $3 ]]; then
  echo 'Usage: /opt/aio/admin.sh reset-password --email EMAIL' >&2
  exit 2
fi
[[ $EUID == 0 ]] || { echo 'Run as container root.' >&2; exit 1; }
[[ -t 0 && -t 1 ]] || { echo 'Interactive terminal required (docker exec -it).' >&2; exit 1; }
source /data/secrets.env
export DATABASE_HOST=127.0.0.1 DATABASE_PORT=5432 DATABASE_USER=lunaris DATABASE_NAME=lunaris
export REDIS_HOST=127.0.0.1 REDIS_PORT=6379
export NODE_ENV=production DEPLOYMENT_MODE=self-hosted
unset E2E_AUTH_EMAIL_LOGS
read -r -s -p 'New password: ' password
printf '\n'
read -r -s -p 'Confirm password: ' confirmation
printf '\n'
[[ "$password" == "$confirmation" ]] || { echo 'Passwords do not match.' >&2; exit 1; }
[[ ${#password} -ge 8 && ${#password} -le 128 ]] || { echo 'Password must contain 8–128 characters.' >&2; exit 1; }
cd /opt/lunaris/apps/api
# Bash builtin keeps the password out of process arguments and environment.
printf '%s' "$password" | bun aio-admin.ts "$3"
