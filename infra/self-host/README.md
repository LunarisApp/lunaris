# Self-host Lunaris

Run Community Edition on one Linux server with Docker Compose. Six services:
web/Caddy, API, PostgreSQL, Redis, PowerSync, and Garage file storage.
Images support AMD64 and ARM64. No source build, Bun, or Git required on your server.

## Install

Prepare a domain (for example, `notes.example.com`) with DNS pointing to your
server. Open TCP ports 80 and 443. Caddy obtains and renews HTTPS certificates.
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
| `BIND_ADDRESS`, `HTTP_PORT`, `HTTPS_PORT` | Published interface/ports; defaults `0.0.0.0`, `80`, `443` |

Mail is needed for password-reset links and invitation delivery. No SMTP server,
Polar account, analytics account, or third-party agent service is provisioned.
Hosted welcome emails are disabled. PowerSync telemetry sharing is disabled.

Only web ports are published. Database, Redis, Garage RPC, and API ports remain
inside Docker's network. Same-origin `/sync/` supports streaming; `/v1/` supports
presence WebSockets; `/lunaris/` serves signed file requests. Desktop and CLI
clients can discover the server through `/.well-known/lunaris-servers`.

Keep deployment files unchanged; use `compose.override.yaml` for local Docker
customizations. Installer and documented commands load the same override file.
The bundled web service handles TLS. Running behind a proxy that terminates TLS
requires a custom Caddy configuration and entrypoint for an internal HTTP
listener; changing published ports alone is insufficient. Keep `PUBLIC_URL` set
to the external HTTPS origin, preserve Host, support WebSockets, and stream
`/sync/` without buffering. A built-in external-TLS mode is not provided.

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

For a consistent backup, stop all six services before archiving volumes. Example
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
# Read-only routing/discovery checks; requires Python 3.
bash smoke.sh https://notes.example.com
# Run only after diagnosing an unhealthy sync service:
docker compose restart powersync
```

Health checks expose readiness; Docker restarts exited containers, not unhealthy
ones. A sync outage does not restart database/API. After prolonged outages,
PostgreSQL's 2 GB replication WAL cap may require PowerSync slot reset/full resync.

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
runs isolated deployment checks. Published bundles never build on the server.
Licensed enterprise builds may set `--build-arg LUNARIS_EDITION=enterprise` for
**both** Docker targets, subject to `ee/LICENSE`; public release images are CE.
