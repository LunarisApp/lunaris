# Self-host Lunaris

Run Community Edition on one Linux server with Docker Compose. Six services:
web/Caddy, API, PostgreSQL, Redis, PowerSync, and Garage file storage.
Images support AMD64 and ARM64. No source build, Bun, or Git required on your server.
The web frontend is optional; backend-only installations run five services behind
your own HTTPS proxy.

## Install

Prepare a domain (for example, `notes.example.com`) with DNS pointing to your
server. Open TCP ports 80 and 443. Caddy obtains and renews HTTPS certificates
by default. If an existing proxy handles HTTPS, use external TLS mode below.
Install Docker Engine with the Compose 2.24+ plugin, curl, and OpenSSL first.
Allow at least 4 GB RAM and enough disk for your resources and backups.

Run from the directory where you want to keep your installation:

```sh
curl -fsSL https://lunaris.app/install.sh | bash
cd lunaris
```

The command downloads the latest stable self-hosted release, verifies its SHA256,
and installs into `./lunaris`. On first install, it asks for your domain or public
URL. Enter `notes.example.com` for automatic HTTPS, or a full URL such as
`https://notes.example.com` or `http://localhost:8080`. Existing installs reuse the
URL from `.env` without prompting.

For unattended installation, supply the URL as an optional argument:

```sh
curl -fsSL https://lunaris.app/install.sh | bash -s -- https://notes.example.com
```

To choose a different directory, append `--dir /path/to/lunaris` after `bash -s --`
(with or without a URL). Without a terminal, first installs require a URL argument.
Docker must already be installed; no repository clone or manual download is
needed. Run as a user with Docker access and write access to that directory.

To pin a release, use `https://lunaris.app/install.sh?version=<version>` (for
example, `?version=1.2.3`) in the command. Available versions and release notes:
https://github.com/LunarisApp/lunaris/releases?q=self-hosted

Each release also provides `install.sh`, `lunaris-self-hosted-<version>.tar.gz`,
and `SHA256SUMS` for operators who prefer to download and inspect files first.

Open the printed URL and create your account. Registration is open by default.
After creating accounts, set `SIGNUPS_ALLOWED=false` in `.env`, then apply it:

```sh
docker compose up -d
```

Closed registration also blocks new accounts invited by existing users.
Existing users can still sign in and accept invitations.

Installer generates `.env` secrets once, provisions storage, migrates the
application database, and waits for API/sync readiness. Interrupted installs can
be rerun. Keep `.env` safe: its encryption key protects existing data. Losing it
can make data unusable. Do not copy `.env.example` over `.env`.

`COMPOSE_PROJECT_NAME` in `.env` identifies the installation and its volumes.
Keep it unchanged. To choose a name, export it before the first installer run;
the installer saves it for subsequent commands. Use unquoted values in `.env`
for `COMPOSE_PROJECT_NAME` and `PUBLIC_URL`.

For local evaluation, use `http://localhost:8080` as the public URL. Installer binds
published ports to loopback and records HTTP port in `.env`. Only localhost HTTP
is supported; browsers require secure contexts for offline storage and passkeys.

## Configure

Edit `.env`, then run `docker compose up -d`. Restart alone does not apply new
settings. `PUBLIC_URL` is the browser-visible origin, without path/trailing slash.
When changing `WEB_ENABLED`, rerun `./install.sh` so the old web container stops
before its ports are reassigned.
Production URLs use `https://domain` and standard port 443. Changing origin needs
no image rebuild; existing clients must connect to the new URL.

| Setting | Default / purpose |
| --- | --- |
| `SIGNUPS_ALLOWED` | `true`; allow new accounts |
| `EMAIL_VERIFICATION_DISABLED` | `true`; enable verification only with working mail |
| `RESEND_API_KEY`, `EMAIL_FROM` | Optional mail delivery; sender must belong to verified Resend domain |
| `EMAIL_REPLY_TO` | Optional administrator reply address |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Optional Google sign-in; callback is `<PUBLIC_URL>/auth/callback/google` |
| `SELF_HOSTED_PLAN` | `enterprise` quotas; cannot enable features absent from Community Edition |
| `TLS_MODE` | `auto`; use `external` when an existing proxy handles HTTPS |
| `WEB_ENABLED` | `true`; `false` omits web and requires `TLS_MODE=external` |
| `FRONTEND_URL` | Defaults to `PUBLIC_URL`; optional compatible frontend origin for auth links and allowed browser origin |
| `API_PORT`, `SYNC_PORT`, `STORAGE_PORT` | Backend-only localhost ports: `3000`, `8080`, `3900` |
| `BIND_ADDRESS`, `HTTP_PORT`, `HTTPS_PORT` | Auto defaults: `0.0.0.0`, `80`, `443`. External defaults: `127.0.0.1`, `8080`, no HTTPS port |

Mail is needed for password-reset links and invitation delivery. No SMTP server,
Polar account, analytics account, or third-party agent service is provisioned.
Hosted welcome emails are disabled. PowerSync telemetry sharing is disabled.

By default, only web ports are published. Database, Redis, Garage RPC, and API ports remain
inside Docker's network. Same-origin `/sync/` supports streaming; `/v1/` supports
presence WebSockets; `/lunaris/` serves signed file requests. Desktop and CLI
clients can discover the server through `/.well-known/lunaris-servers`.

Keep deployment files unchanged; use `compose.override.yaml` for local Docker
customizations. Installer and documented commands load the same override file.

### Existing HTTPS reverse proxy

Choose external TLS mode during installation:

```sh
curl -fsSL https://lunaris.app/install.sh | bash -s -- --tls-mode external
```

The installer prompts for your public domain. For unattended installation, append
`https://notes.example.com`. External mode saves `TLS_MODE=external` in `.env`,
serves HTTP on `127.0.0.1:8080`, and leaves certificates to your proxy. Keep
`PUBLIC_URL=https://notes.example.com`; HTTPS URLs and secure cookies remain
enabled. Installer readiness checks use the internal listener, so you can
configure your proxy afterward.

For an existing installation, set `TLS_MODE=external` in `.env`, then rerun
`./install.sh`. To change the local port, set `HTTP_PORT` in `.env`. Default
automatic HTTPS resumes when `TLS_MODE=auto`.

Example for an existing Caddy proxy on the same host:

```caddyfile
notes.example.com {
    reverse_proxy 127.0.0.1:8080 {
        flush_interval -1
    }
}
```

Your proxy must preserve the original Host (including its port), support
WebSocket upgrades, and stream `/sync/` without buffering. Caddy does this with
the configuration above. For a proxy running in Docker, connect it to the
installation's Docker network and use `web:80` as the upstream. Set `BIND_ADDRESS`
explicitly only if the HTTP listener must be reachable from another host.

### Backend without web

To use a compatible client without hosting the bundled web frontend:

```sh
curl -fsSL https://lunaris.app/install.sh | bash -s -- --no-web
```

Append `https://notes.example.com` for unattended installation. This saves
`WEB_ENABLED=false` and `TLS_MODE=external`; upgrades retain both settings.
The web image is neither pulled nor started. API, PostgreSQL, Redis, PowerSync,
and Garage still run. `PUBLIC_URL` remains the backend's public HTTPS origin.

Configure your existing HTTPS proxy using the bundled `Caddyfile.backend`
example. Set `PUBLIC_URL` in Caddy's service environment to the backend origin,
then import that file into your Caddy configuration. It routes API/auth,
WebSockets, sync streams, signed files, and server/region discovery. Caddy
obtains certificates as usual. The default upstreams on the same host are:

| Route | HTTP upstream | Handling |
| --- | --- | --- |
| `/v1/*`, `/auth/*`, `/api/*`, `/oauth2/*`, other `/.well-known/*` | `127.0.0.1:3000` | Preserve path and Host |
| `/sync/*` | `127.0.0.1:8080` | Strip `/sync`; stream without buffering |
| `/lunaris/*` | `127.0.0.1:3900` | Preserve path, query, and Host for S3 signatures |

The sample also serves discovery JSON. Other proxy software needs equivalent
routes. For a proxy in Docker, join the installation's network and set
`API_UPSTREAM=api:3000`, `SYNC_UPSTREAM=powersync:80`, and
`STORAGE_UPSTREAM=garage:3900` in its environment. Keep the backend ports on
loopback unless a proxy on another host must reach them.

For an existing install, edit `.env` to set `WEB_ENABLED=false` and
`TLS_MODE=external`, then rerun `./install.sh`. The installer removes the old web
container and preserves data/certificate volumes. To restore bundled web, set
`WEB_ENABLED=true`, choose your TLS mode, and rerun the installer.

This option prepares server deployment for independent clients. It does not add
third-party server selection to current production clients. Browser login,
invitations, and password-reset screens need a compatible frontend; set
`FRONTEND_URL` to that frontend's origin when available. No web pages are served
by a backend-only installation.

## Upgrade

Read release notes and take a backup first. From the existing installation
directory, run the remote command without a public URL:

```sh
curl -fsSL https://lunaris.app/install.sh | bash
```

Use `?version=<version>` to select a specific release, or `--dir` to specify an
installation outside the current directory. Existing `release.json` and
`compose.yaml` identify the installation; otherwise the default is `./lunaris`.
Downloads and checksums are verified before deployment files are replaced.
Bundle contains no `.env`; your secrets, overrides, and Docker volumes remain
in place.
Images are pinned by digest and built from the same release commit. Installer
pulls and validates before stopping API/sync, then provisions storage, migrates,
and starts the release. Expect downtime. If migration fails, application services
stay stopped. Fix the reported problem and rerun installer; inspect logs below.
To retry the already downloaded release without fetching another one, run
`./install.sh` inside the installation directory.

Do not upgrade individual images or PostgreSQL majors independently. PostgreSQL
17 is pinned; future major upgrades require an explicit data-migration procedure.
Image rollback after schema changes requires restoring the matching backup.

## Back up and restore

Back up the **whole installation**: `.env`, release files/overrides, and named
volumes `postgres`, `redis`, `garage`, `admin`, `caddy`, and `caddy_config`.
Garage metadata and blocks must stay together. `admin` contains password-recovery
audit records; Caddy volumes contain certificate state.
If web has never run, omit `caddy` and `caddy_config` from the volume loops below.

For a consistent backup, stop all running services before archiving volumes. Example
for the default project (use absolute backup path):

```sh
umask 077
docker compose stop
mkdir -p "$PWD/backups"
# Includes .env, release.json, Compose, and all operator configuration.
tar czf backups/config.tar.gz --exclude=./backups --exclude=./.install.lock .
for name in postgres redis garage admin caddy caddy_config; do
  docker run --rm \
    -v "lunaris-self-host_${name}:/source:ro" \
    -v "$PWD/backups:/backup" \
    alpine:3.21 sh -ec 'umask 077; tar czf "/backup/$1.tar.gz" -C /source .' -- "$name"
done
docker compose start
```

Restrict access and encrypt off-server backups. Check each command succeeded
before relying on the backup. Never run `docker compose down -v` on live data.

Restore on the **same release and architecture**, into a new installation with
empty volumes. Extract `config.tar.gz`, run `docker compose create` to create its
volumes without starting services, then restore each archive:

```sh
for name in postgres redis garage admin caddy caddy_config; do
  docker run --rm \
    -v "lunaris-self-host_${name}:/destination" \
    -v "$PWD/backups:/backup:ro" \
    alpine:3.21 sh -ec 'tar xzpf "/backup/$1.tar.gz" -C /destination' -- "$name"
done
./install.sh
```

This preserves numeric ownership. Test login, resources, sync, and file downloads
on restored installation before replacing a working one. Do not run two
installations against the same volumes. A custom `COMPOSE_PROJECT_NAME` changes
volume prefixes: use exact names from `docker volume ls`.

## Diagnose and recover a password

```sh
docker compose ps --all
docker compose logs --tail=150 api powersync garage postgres
# Bundled-web routing/discovery checks; requires Python 3.
bash smoke.sh https://notes.example.com
# Run only after diagnosing an unhealthy sync service:
docker compose restart powersync
```

Health checks expose readiness; Docker restarts exited containers, not unhealthy
ones. A sync outage does not restart database/API. After prolonged outages,
PostgreSQL's 2 GB replication WAL cap may require PowerSync slot reset/full resync.
For backend-only installs, check `/v1/health` and `/sync/probes/readiness` through
your public proxy; `smoke.sh` also expects bundled web pages.

Without mail, recover an existing password account through an interactive terminal:

```sh
docker compose exec --user root api lunaris-admin reset-password --email you@example.com
```

Password stays out of arguments/environment. Uses Better Auth policy/hashing,
revokes existing sessions, and appends a root-owned persistent audit record. Google-only
accounts and 2FA stay unchanged; previously issued email-reset links expire
normally. Offline data cannot be remotely erased.

## Development

From a source checkout, `tooling/self-host/test-stack.sh` builds both images and
runs isolated deployment checks. Then run
`bash tooling/self-host/test-external-tls.sh` to check an existing TLS proxy using
those images. Published bundles never build on the server.
Add `--no-web` to that test command to verify a backend-only installation.
Licensed enterprise builds may set `--build-arg LUNARIS_EDITION=enterprise` for
**both** Docker targets, subject to `ee/LICENSE`; public release images are CE.
