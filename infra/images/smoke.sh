#!/usr/bin/env bash
set -euo pipefail
app=${1:?App required}
image=${2:?Image required}
name="lunaris-image-check-$$"
cleanup() {
  docker logs --tail 80 "$name" 2>/dev/null || true
  docker rm -f -v "$name" "$name-db" "$name-storage" >/dev/null 2>&1 || true
  docker network rm "$name" >/dev/null 2>&1 || true
}
trap cleanup EXIT
docker network create "$name" >/dev/null
if [ "$app" = web ]; then
  docker run -d --name "$name" --network "$name" \
    -e 'VITE_REGION_DIRECTORY_JSON=[{"id":"selfhost","label":"Self-hosted","status":"active","apiUrl":"https://api.example.com","default":true}]' "$image" >/dev/null
  path=/health
elif [ "$app" = api ]; then
  docker run -d --name "$name-db" --network "$name" \
    -e POSTGRES_USER=lunaris -e POSTGRES_PASSWORD=testing -e POSTGRES_DB=lunaris postgres:17 >/dev/null
  for attempt in $(seq 1 30); do
    if docker exec "$name-db" pg_isready -U lunaris; then break; fi
    sleep 2
  done
  # S3 health probe stub. Full storage/sync integration remains covered by AIO tests.
  docker run -d --name "$name-storage" --network "$name" oven/bun:1.4.0-debian \
    bun -e 'Bun.serve({port:9000,fetch:()=>new Response(null,{status:200})})' >/dev/null
  environment=(
    -e "DATABASE_HOST=$name-db" -e DATABASE_PORT=5432 -e DATABASE_USER=lunaris
    -e DATABASE_PASSWORD=testing -e DATABASE_NAME=lunaris -e DATABASE_SSL=false
    -e "AWS_ENDPOINT_URL=http://$name-storage:9000" -e AWS_DEFAULT_REGION=us-east-1
    -e AWS_S3_BUCKET=lunaris -e AWS_ACCESS_KEY_ID=testing -e AWS_SECRET_ACCESS_KEY=testing
    -e URL=http://localhost:3000 -e FRONTEND_URL=http://localhost:3000
    -e POWERSYNC_URL=http://localhost:8080 -e APP_REGION=selfhost
    -e BETTER_AUTH_SECRET=0123456789012345678901234567890123456789
    -e LOCAL_DB_ENCRYPTION_MASTER_KEY=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
  )
  docker run --rm --network "$name" "${environment[@]}" "$image" bun migrate.ts
  docker run -d --name "$name" --network "$name" "${environment[@]}" "$image" >/dev/null
  path=/v1/health
else
  echo "Unknown app: $app" >&2
  exit 1
fi
ready=false
for attempt in $(seq 1 40); do
  if docker exec "$name" bun -e "const r=await fetch('http://localhost:3000$path');process.exit(r.ok?0:1)"; then
    ready=true
    break
  fi
  sleep 3
done
[ "$ready" = true ]
if [ "$app" = web ]; then
  docker exec "$name" bun -e '
    const base="http://localhost:3000";
    const regions=await fetch(`${base}/regions.json`);
    if(regions.headers.get("cache-control")!=="no-store" || (await regions.json())[0].apiUrl!=="https://api.example.com") throw Error("Region discovery failed");
    const page=await fetch(`${base}/workspace/example`);
    if(!page.ok || !(await page.text()).includes("<html") || !page.headers.get("content-security-policy")?.includes("wss://api.example.com")) throw Error("SPA or CSP failed");
  '
fi
