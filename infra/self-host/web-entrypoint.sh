#!/bin/sh
set -eu
: "${PUBLIC_URL:?PUBLIC_URL is required}"
case "$PUBLIC_URL" in
  *'
'*) echo 'PUBLIC_URL must be one origin' >&2; exit 1 ;;
esac
printf '%s' "$PUBLIC_URL" | grep -Eq '^https://[A-Za-z0-9][A-Za-z0-9.-]*$|^http://(localhost|127\.0\.0\.1)(:[0-9]+)?$' || {
  echo 'PUBLIC_URL requires HTTPS (or localhost HTTP), without a path or trailing slash' >&2
  exit 1
}
export PUBLIC_AUTHORITY="${PUBLIC_URL#*://}"
export PUBLIC_SCHEME="${PUBLIC_URL%%://*}"
PRESENCE_ORIGIN=$(printf '%s' "$PUBLIC_URL" | sed 's/^http/ws/')
export PRESENCE_ORIGIN
# Caddy listens on container port 80 even when localhost is published elsewhere.
case "$PUBLIC_URL" in
  http://localhost:*|http://127.0.0.1:*) export CADDY_SITE_ADDRESS="http://${PUBLIC_AUTHORITY%%:*}" ;;
  *) export CADDY_SITE_ADDRESS="$PUBLIC_URL" ;;
esac
exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
