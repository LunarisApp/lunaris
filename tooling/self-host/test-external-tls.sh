#!/usr/bin/env bash
# Uses existing test images; only this random Compose project's data is removed.
set -Eeuo pipefail
umask 077
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.."
root=$PWD
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
cat > "$work/install/compose.override.yaml" <<'YAML'
services:
  api:
    volumes:
      - ./external-tls-smoke.ts:/opt/lunaris/apps/api/external-tls-smoke.ts:ro
      - ./proxy.crt:/tmp/proxy.crt:ro
  proxy:
    image: caddy:2.10.2-alpine@sha256:4c6e91c6ed0e2fa03efd5b44747b625fec79bc9cd06ac5235a779726618e530d
    command: [caddy, run, --config, /etc/caddy/Caddyfile, --adapter, caddyfile]
    volumes:
      - ./Proxyfile:/etc/caddy/Caddyfile:ro
      - ./proxy.crt:/proxy.crt:ro
      - ./proxy.key:/proxy.key:ro
    networks:
      default:
        aliases: [notes.lunaris.test]
    depends_on:
      web:
        condition: service_healthy
YAML
(cd "$work/install" && ./install.sh https://notes.lunaris.test)
# Rendered configuration must publish one loopback HTTP port, with no TLS bind.
compose config --format json | python3 -c 'import json,sys; ports=json.load(sys.stdin)["services"]["web"]["ports"]; assert len(ports)==1 and ports[0]["host_ip"]=="127.0.0.1" and ports[0]["target"]==80'
compose exec -T api bun external-tls-smoke.ts
