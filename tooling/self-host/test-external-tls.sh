#!/usr/bin/env bash
# Uses existing test images; only this random Compose project's data is removed.
set -Eeuo pipefail
umask 077
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.."
root=$PWD
[[ $# -eq 0 || ($# -eq 1 && $1 == --no-web) ]] || { echo 'Usage: test-external-tls.sh [--no-web]' >&2; exit 1; }
export WEB_ENABLED=true
if [[ ${1:-} == --no-web ]]; then
  export WEB_ENABLED=false
  export API_PORT=${SELF_HOST_BACKEND_API_PORT:-18096}
  export SYNC_PORT=${SELF_HOST_BACKEND_SYNC_PORT:-18097}
  export STORAGE_PORT=${SELF_HOST_BACKEND_STORAGE_PORT:-18098}
fi
work=$(mktemp -d "$root/.context/self-host-external.XXXXXX")
COMPOSE_PROJECT_NAME="lunaris-proxy-test-$(openssl rand -hex 6)"
export COMPOSE_PROJECT_NAME
export TLS_MODE=external HTTP_PORT=${SELF_HOST_PROXY_TEST_PORT:-18092}
compose() { (cd "$work/install" && docker compose "$@"); }
cleanup() {
  compose logs --no-color > "$work/containers.log" 2>&1 || true
  compose down --volumes --remove-orphans >/dev/null 2>&1 || true
  echo "External TLS test logs: $work"
}
trap cleanup EXIT
bun tooling/self-host/bundle.ts "$work/install" 0.0.0 "$(git rev-parse HEAD)" \
  lunaris:self-host-api-test lunaris:self-host-web-test --local
cat > "$work/install/cert.conf" <<'CONF'
[req]
distinguished_name = subject
x509_extensions = SAN
[subject]
[SAN]
subjectAltName = DNS:notes.lunaris.test
CONF
openssl req -x509 -newkey rsa:2048 -nodes -days 2 \
  -subj /CN=notes.lunaris.test -config "$work/install/cert.conf" \
  -keyout "$work/install/proxy.key" -out "$work/install/proxy.crt" >/dev/null 2>&1
chmod 644 "$work/install/proxy.crt"
cp tooling/self-host/external-tls-smoke.ts "$work/install/external-tls-smoke.ts"
chmod 644 "$work/install/external-tls-smoke.ts"
cat > "$work/install/Proxyfile" <<'CADDY'
{
  admin off
  auto_https off
}
https://notes.lunaris.test {
  tls /proxy.crt /proxy.key
  reverse_proxy web:80 {
    flush_interval -1
  }
}
CADDY
chmod 644 "$work/install/Proxyfile"
if [[ $WEB_ENABLED == false ]]; then
  python3 - "$work/install" <<'PY'
from pathlib import Path
import sys
root = Path(sys.argv[1])
config = (root / 'Caddyfile.backend').read_text().replace(
    '{$PUBLIC_URL} {', '{$PUBLIC_URL} {\n\ttls /proxy.crt /proxy.key')
(root / 'Proxyfile').write_text('{\n admin off\n auto_https off\n}\n' + config)
PY
fi
cat > "$work/install/compose.override.yaml" <<'YAML'
services:
  api:
    volumes:
      - ./external-tls-smoke.ts:/opt/lunaris/apps/api/external-tls-smoke.ts:ro
      - ./proxy.crt:/tmp/proxy.crt:ro
  proxy:
    image: caddy:2.10.2-alpine@sha256:4c6e91c6ed0e2fa03efd5b44747b625fec79bc9cd06ac5235a779726618e530d
    command: [caddy, run, --config, /etc/caddy/Caddyfile, --adapter, caddyfile]
    environment:
      PUBLIC_URL: ${PUBLIC_URL}
      API_UPSTREAM: api:3000
      SYNC_UPSTREAM: powersync:80
      STORAGE_UPSTREAM: garage:3900
    volumes:
      - ./Proxyfile:/etc/caddy/Caddyfile:ro
      - ./proxy.crt:/proxy.crt:ro
      - ./proxy.key:/proxy.key:ro
    networks:
      default:
        aliases: [notes.lunaris.test]
    depends_on:
      api:
        condition: service_healthy
      powersync:
        condition: service_healthy
      garage:
        condition: service_healthy
YAML
if [[ $WEB_ENABLED == false ]]; then
  # A disabled frontend must not even be pulled or run during preflight.
  cat >> "$work/install/compose.override.yaml" <<'YAML'
  web:
    image: invalid.invalid/lunaris-web:must-not-pull
YAML
fi
(cd "$work/install" && ./install.sh https://notes.lunaris.test)
unset WEB_ENABLED TLS_MODE
# Rendered configuration must publish one loopback HTTP port, with no TLS bind.
if [[ ${1:-} == --no-web ]]; then
  [[ -z $(compose ps --all -q web) ]]
  compose config --format json | python3 -c 'import json,sys; services=json.load(sys.stdin)["services"]; assert "web" not in services; ports=[services[s]["ports"][0] for s in ["api","powersync","garage"]]; assert all(p["host_ip"]=="127.0.0.1" for p in ports)'
  compose exec -T -e SELF_HOST_NO_WEB=1 api bun external-tls-smoke.ts
  # Retry must read the saved mode without recreating or pulling web.
  (cd "$work/install" && ./install.sh)
  [[ -z $(compose ps --all -q web) ]]
  # Switching modes may transfer the same published port from sync to web.
  # Keep the real frontend image available only for this explicit switch.
  python3 - "$work/install" <<'PY'
from pathlib import Path
import sys
root = Path(sys.argv[1])
path = root / 'compose.override.yaml'
path.write_text(path.read_text().replace('invalid.invalid/lunaris-web:must-not-pull', 'lunaris:self-host-web-test'))
path = root / '.env'
path.write_text(path.read_text().replace('WEB_ENABLED=false', 'WEB_ENABLED=true'))
PY
  export HTTP_PORT=$SYNC_PORT
  (cd "$work/install" && ./install.sh)
  curl -fsS -H 'Host: notes.lunaris.test' "http://127.0.0.1:$HTTP_PORT/" | grep -q '<!doctype html>'
  python3 - "$work/install/.env" <<'PY'
from pathlib import Path
import sys
path = Path(sys.argv[1])
path.write_text(path.read_text().replace('WEB_ENABLED=true', 'WEB_ENABLED=false'))
PY
  (cd "$work/install" && ./install.sh)
  [[ -z $(compose ps --all -q web) ]]
  compose exec -T -e SELF_HOST_NO_WEB=1 api bun external-tls-smoke.ts
else
  compose config --format json | python3 -c 'import json,sys; ports=json.load(sys.stdin)["services"]["web"]["ports"]; assert len(ports)==1 and ports[0]["host_ip"]=="127.0.0.1" and ports[0]["target"]==80'
  compose exec -T api bun external-tls-smoke.ts
fi
