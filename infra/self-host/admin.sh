#!/bin/bash
set -euo pipefail
set +x
if [[ $# != 3 || $1 != reset-password || $2 != --email || -z $3 ]]; then
  echo 'Usage: docker compose exec --user root api lunaris-admin reset-password --email EMAIL' >&2
  exit 2
fi
[[ $EUID == 0 ]] || { echo 'Run with docker compose exec --user root api.' >&2; exit 1; }
[[ -t 0 && -t 1 ]] || { echo 'Interactive terminal required.' >&2; exit 1; }
unset E2E_AUTH_EMAIL_LOGS
read -r -s -p 'New password: ' password
printf '\n'
read -r -s -p 'Confirm password: ' confirmation
printf '\n'
[[ "$password" == "$confirmation" ]] || { echo 'Passwords do not match.' >&2; exit 1; }
[[ ${#password} -ge 8 && ${#password} -le 128 ]] || { echo 'Password must contain 8–128 characters.' >&2; exit 1; }
cd /opt/lunaris/apps/api
printf '%s' "$password" | bun admin.ts "$3"
