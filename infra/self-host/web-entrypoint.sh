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
# Caddy's listener is separate from the public origin behind a TLS proxy.
case "${TLS_MODE:-auto}" in
  auto)
    CADDY_SITE_ADDRESS="$PUBLIC_URL"
    case "$PUBLIC_URL" in
      http://*) CADDY_SITE_ADDRESS="http://${PUBLIC_AUTHORITY%%:*}" ;;
    esac ;;
  external)
    [ "$PUBLIC_SCHEME" = https ] || { echo 'TLS_MODE=external requires an HTTPS PUBLIC_URL' >&2; exit 1; }
    CADDY_SITE_ADDRESS="http://$PUBLIC_AUTHORITY" ;;
  *) echo 'TLS_MODE must be auto or external' >&2; exit 1 ;;
esac
export CADDY_SITE_ADDRESS
if [ "$#" -eq 0 ]; then set -- run; fi
exec caddy "$@" --config /etc/caddy/Caddyfile --adapter caddyfile
