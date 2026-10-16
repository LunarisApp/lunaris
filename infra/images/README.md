# Separate Community images

Docker Hub repositories:

- `lunarisapp/lunaris-api`: API server, production dependencies and migrations.
- `lunarisapp/lunaris-web`: static web application and Bun HTTP server.

Both run as the unprivileged `bun` user on port 3000, with Linux amd64 and
arm64 releases. API requires external PostgreSQL and S3-compatible storage;
configure PowerSync separately for client sync. Redis is optional.

## Publishing

The existing Changesets release coordinator creates `api@<version>` and
`web@<version>` tags using the release GitHub App. These trigger
`images.publish.yml`; Railway publication continues independently.
The image version must match the tagged app's `package.json`.
Stable source must belong to `main`; prerelease source must belong to `next`.

Stable versions publish exact `1.2.3`, minor `1.2`, major `1`, `latest`, and
`sha-<full commit SHA>` tags. Prereleases publish exact version and SHA only.
Older versions cannot move newer channel aliases backward. Existing exact
versions are verified and reused by digest on retry. Use workflow dispatch
with an existing tag to recover a failed publication.

GitHub Actions secrets `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` must allow
writes to **both repositories**, in addition to `lunarisapp/lunaris-aio`.
Repository-scoped tokens configured only for AIO need expanded access.
Each architecture passes exact-source CI and a container smoke test before
upload. API smoke tests run migrations against PostgreSQL and use an S3
health-probe stub; full storage and sync integration is tested by AIO.

## API

Set `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_USER`, `DATABASE_PASSWORD`,
`DATABASE_NAME`, and `DATABASE_SSL` (`true` by default; `false` for local DBs).
Set `AWS_ENDPOINT_URL`, `AWS_PUBLIC_ENDPOINT_URL`, `AWS_DEFAULT_REGION`,
`AWS_S3_BUCKET`, `AWS_ACCESS_KEY_ID`, and `AWS_SECRET_ACCESS_KEY`.

Set `URL` to the public API origin, `FRONTEND_URL` to the web origin,
`POWERSYNC_URL` to the public sync URL, `APP_REGION` to the region ID,
`BETTER_AUTH_SECRET` to a random secret, and `LOCAL_DB_ENCRYPTION_MASTER_KEY`
to 64 random hexadecimal characters. To enable Redis, set all three of
`REDIS_HOST`, `REDIS_PORT`, and `REDIS_PASSWORD`.
Configure email delivery or explicitly set `EMAIL_VERIFICATION_DISABLED=true`
for installations without verification email.

Run migrations once before starting/upgrading API replicas, using the same
image version and environment:

```sh
docker run --rm --env-file api.env lunarisapp/lunaris-api:1.2.3 bun migrate.ts
docker run -d --env-file api.env -p 3000:3000 lunarisapp/lunaris-api:1.2.3
```

Examples use a placeholder version; choose a published release. Health endpoint:
`/v1/health`. Migrations are explicit so replicas do not race at startup.

## Web

Supply `VITE_REGION_DIRECTORY_JSON` at **runtime**. No rebuild required:

```sh
docker run -d -p 3001:3000 \
  -e 'VITE_REGION_DIRECTORY_JSON=[{"id":"selfhost","label":"Self-hosted","status":"active","apiUrl":"https://api.example.com","default":true}]' \
  lunarisapp/lunaris-web:1.2.3
```

The public API URL must be browser-accessible and match API `URL`.
The directory is served at `/regions.json` without caching; its API origins
also configure WebSocket CSP permissions. Invalid/missing settings fail startup.
Use HTTPS behind a reverse proxy and forward `X-Forwarded-Proto`; localhost
HTTP works for development. Health endpoint: `/health`.

## Local verification

From repository root:

```sh
docker build -f infra/images/api.Dockerfile -t lunaris:api-test .
bash infra/images/smoke.sh api lunaris:api-test
docker build -f infra/images/web.Dockerfile -t lunaris:web-test .
bash infra/images/smoke.sh web lunaris:web-test
```
