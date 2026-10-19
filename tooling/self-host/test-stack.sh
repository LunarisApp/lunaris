#!/usr/bin/env bash
# Isolated destructive tests: only resources created under this random project.
set -Eeuo pipefail
umask 077
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.."
root=$PWD
if [[ ${SELF_HOST_SKIP_BUILD:-0} != 1 ]]; then bash tooling/self-host/build.sh; fi
mkdir -p .context
work=$(mktemp -d "$root/.context/self-host-test.XXXXXX")
project="lunaris-test-$(openssl rand -hex 6)"
export COMPOSE_PROJECT_NAME=$project
compose() { (cd "$work/install" && docker compose "$@"); }
cleanup() {
  compose logs --no-color > "$work/containers.log" 2>&1 || true
  COMPOSE_PROJECT_NAME="$project" compose down --volumes --remove-orphans >/dev/null 2>&1 || true
  COMPOSE_PROJECT_NAME="$project-restore" compose down --volumes --remove-orphans >/dev/null 2>&1 || true
  echo "Self-host test logs: $work"
}
trap cleanup EXIT
bun tooling/self-host/bundle.ts "$work/install" 0.0.0 "$(git rev-parse HEAD)" \
  lunaris:self-host-api-test lunaris:self-host-web-test --local
# Local-only ports keep the existing developer stack untouched.
port=${SELF_HOST_TEST_PORT:-18080}
origin="http://localhost:$port"
export HTTPS_PORT=${SELF_HOST_TEST_HTTPS_PORT:-18443}
(cd "$work/install" && ./install.sh "$origin")
bash "$work/install/smoke.sh" "$origin"
secret_hash=$(openssl dgst -sha256 "$work/install/.env")

# Real signup/login through the proxy, including its /auth page/API overlap.
email="self-host-$project@example.com"
curl -fsS -c "$work/cookies" -H "Origin: $origin" -H "X-Forwarded-For: 198.51.100.123" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Self-host smoke\",\"email\":\"$email\",\"password\":\"Self-host-smoke-1234\"}" \
  "$origin/auth/sign-up/email" > "$work/signup.json"
curl -fsS -b "$work/cookies" "$origin/auth/get-session" | \
  python3 -c 'import json,sys; v=json.load(sys.stdin); assert v["user"]["email"].startswith("self-host-"); assert v["session"]["ipAddress"] != "198.51.100.123"'

# Write and edit a real resource through authenticated API before upgrading.
workspace_id=$(curl -fsS -b "$work/cookies" -H "Origin: $origin" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Deployment smoke","slug":"deployment-smoke"}' \
  "$origin/v1/workspaces" | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')
resource_id=$(curl -fsS -b "$work/cookies" -H "Origin: $origin" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Before upgrade","resourceTypeId":"lunaris.folder","storage":{}}' \
  "$origin/v1/workspaces/$workspace_id/resources" | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')
curl -fsS -X PATCH -b "$work/cookies" -H "Origin: $origin" \
  -H 'Content-Type: application/json' -d '{"name":"Persisted resource"}' \
  "$origin/v1/workspaces/$workspace_id/resources/$resource_id" > /dev/null

# Sign inside API image, then PUT/GET from the host through Caddy. Spaces and +
# exercise URI preservation. Never write generated credentials to test output.
sign() {
  compose exec -T api bun -e '
    import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
    import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
    const e=process.env;
    const client=new S3Client({endpoint:e.AWS_PUBLIC_ENDPOINT_URL, region:e.AWS_DEFAULT_REGION,forcePathStyle:true,credentials:{accessKeyId:e.AWS_ACCESS_KEY_ID,secretAccessKey:e.AWS_SECRET_ACCESS_KEY},requestChecksumCalculation:"WHEN_REQUIRED"});
    const Command=process.argv[1]==="put"?PutObjectCommand:GetObjectCommand;
    console.log(await getSignedUrl(client,new Command({Bucket:"lunaris",Key:"self-host-smoke/file + space.txt"}),{expiresIn:3600}));
  ' "$1"
}
printf 'persistent self-host upload\n' > "$work/file.txt"
upload=$(sign put)
curl -fsS -X PUT --data-binary "@$work/file.txt" "$upload" > /dev/null
download=$(sign get)
curl -fsS "$download" | cmp - "$work/file.txt"
# A forged forwarding header must not change the manifest's advertised URL.
curl -fsS -H 'X-Forwarded-Proto: http' -H 'X-Forwarded-Host: attacker.invalid' \
  "$origin/v1/manifest" > "$work/manifest.json"
python3 - "$work/manifest.json" "$origin" <<'PY'
import json,sys
v=json.load(open(sys.argv[1]));assert sys.argv[2] in json.dumps(v);assert 'attacker.invalid' not in json.dumps(v)
PY

# Reinstall/upgrade and component restart preserve secrets, account, and object.
(cd "$work/install" && ./install.sh)
[[ $(openssl dgst -sha256 "$work/install/.env") == "$secret_hash" ]]
compose restart api powersync
compose up -d --wait --wait-timeout 300
curl -fsS "$download" | cmp - "$work/file.txt"
compose stop powersync
curl -fsS "$origin/v1/health" >/dev/null
compose start powersync
compose up -d --wait --wait-timeout 300

# Missing configuration refuses to create new secrets over any existing volume.
mv "$work/install/.env" "$work/install/.env.saved"
if (cd "$work/install" && ./install.sh "$origin") > "$work/missing-env.log" 2>&1; then
  echo 'Installer replaced missing secrets over existing data' >&2; exit 1
fi
[[ ! -f "$work/install/.env" ]]
mv "$work/install/.env.saved" "$work/install/.env"

# Fail a migration intentionally. Application must stay down until repaired.
printf 'throw new Error("intentional migration failure");\n' > "$work/install/fail-migration.ts"
cat > "$work/install/compose.override.yaml" <<'YAML'
services:
  api:
    volumes:
      - ./fail-migration.ts:/opt/lunaris/apps/api/migrate.ts:ro
YAML
if (cd "$work/install" && ./install.sh) > "$work/failed-migration.log" 2>&1; then
  echo 'Expected migration failure' >&2; exit 1
fi
[[ -z $(compose ps --status running -q api powersync web) ]]
rm "$work/install/compose.override.yaml" "$work/install/fail-migration.ts"
(cd "$work/install" && ./install.sh)

# Cold backup/restore into fresh volumes, including Garage metadata and secrets.
compose stop
mkdir "$work/backup"
for name in postgres redis garage admin caddy caddy_config; do
  docker run --rm --entrypoint tar -v "${project}_${name}:/source:ro" \
    -v "$work/backup:/backup" postgres:17 -czf "/backup/$name.tar.gz" -C /source .
done
export COMPOSE_PROJECT_NAME="$project-restore"
compose create
for name in postgres redis garage admin caddy caddy_config; do
  docker run --rm --entrypoint tar -v "${COMPOSE_PROJECT_NAME}_${name}:/destination" \
    -v "$work/backup:/backup:ro" postgres:17 -xzpf "/backup/$name.tar.gz" -C /destination
done
(cd "$work/install" && ./install.sh)
bash "$work/install/smoke.sh" "$origin"
curl -fsS "$download" | cmp - "$work/file.txt"
curl -fsS -c "$work/login-cookies" -H "Origin: $origin" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$email\",\"password\":\"Self-host-smoke-1234\"}" \
  "$origin/auth/sign-in/email" > /dev/null
curl -fsS -b "$work/login-cookies" "$origin/auth/get-session" | \
  python3 -c 'import json,sys; assert json.load(sys.stdin)["user"]["email"].startswith("self-host-")'
curl -fsS -b "$work/login-cookies" "$origin/v1/workspaces/$workspace_id/resources/$resource_id" | \
  python3 -c 'import json,sys; assert json.load(sys.stdin)["name"] == "Persisted resource"'
echo 'Self-host install, routing, auth, resources, signed storage, upgrade, failure isolation, migration guard, and restore passed.'
