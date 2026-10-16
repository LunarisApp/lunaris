# Lunaris all-in-one (legacy)

New installations should use the [Compose deployment](../self-host/README.md).
Keep existing AIO data and backups; automatic migration is not available yet.

Community Edition is the default. Set `LUNARIS_EDITION=enterprise` when building
or developing to include [enterprise features](../../ee/README.md), subject to
the [EE license](../../ee/LICENSE).

One container: PostgreSQL, Redis, Garage S3, PowerSync, API, and web behind Nginx.
For testing, demos, personal use, and homelabs. Single node; no high availability.

From the repository root:

```sh
docker compose -f infra/all-in-one/compose.yaml up -d --build --wait
```

Open http://localhost:8080 and create an account. Email verification is disabled
by default, and anyone who can reach the service can sign up. Keep demos private
or restrict access at your reverse proxy.

Only port 8080 is published, bound to host loopback by default. No Docker socket,
privileged container, or external database is needed. Secrets are generated once
and kept in the named `data` volume alongside databases and uploaded files.
Application processes run as unprivileged users; the entrypoint and supervisor
need root to initialize permissions and switch users.

## Enterprise builds

With permission under the [EE license](../../ee/LICENSE):

```sh
LUNARIS_EDITION=enterprise docker compose -f infra/all-in-one/compose.yaml up -d --build --wait
```

For direct Docker builds, add `--build-arg LUNARIS_EDITION=enterprise`.
The selector runs at build time; changing runtime environment cannot enable EE.
Community images omit EE code and dependencies. Both editions retain existing
team/audit tables and migrations; switching editions preserves stored data.
Community does not expose teams or audit review, or persist new signed audit records.

## Build and run directly

```sh
docker build -f infra/all-in-one/Dockerfile -t lunaris:all-in-one .
docker run -d --name lunaris --restart unless-stopped \
  --stop-timeout 300 --shm-size 256m \
  -p 127.0.0.1:8080:8080 -v lunaris-data:/data \
  -e PUBLIC_URL=http://localhost:8080 lunaris:all-in-one
```

Reserve at least 4 GB RAM and adequate disk space; builds need more memory.
The first boot initializes databases, migrates the schema, provisions storage,
and then starts API and sync. Bootstrap errors stop the container. Sync startup
or readiness failures leave healthy services running. Docker readiness never
triggers a whole-stack restart.

## HTTPS / homelab

Set `PUBLIC_URL=https://notes.example.com` and reverse proxy that origin to
container port 8080. Forward the original Host header, support WebSocket upgrades,
and disable response buffering for `/sync/`. TLS terminates at your reverse proxy.
Non-localhost HTTP is rejected because browser crypto, offline storage, and
passkeys need a secure context. No rebuild is needed when changing PUBLIC_URL.

With Compose, variables can be supplied in the shell or via `--env-file`:

```sh
PUBLIC_URL=https://notes.example.com \
  docker compose -f infra/all-in-one/compose.yaml up -d
```

Set `BIND_ADDRESS=0.0.0.0` only when another host must reach the reverse-proxy
upstream; restrict access using the host firewall. Publish **only** port 8080.
The bundled proxy supplies the scheme from PUBLIC_URL and replaces client-supplied
forwarding headers. All clients must use that configured origin.
Browser requests on another hostname (for example `127.0.0.1` instead of
`localhost`) redirect to `PUBLIC_URL`, keeping cookies, discovery, and CSP on
the same origin. API and signed storage requests retain their original routing.

## Settings

- `SIGNUPS_ALLOWED`: defaults to `true`. Create your first account while bound
  to localhost, then set `false` to block all new accounts, including through
  invitations. Existing users can still sign in and accept invitations. Apply
  changes with `docker compose -f infra/all-in-one/compose.yaml up -d`; a restart
  alone does not apply environment changes. No rebuild is needed.
- `PUBLIC_URL`: browser-visible origin, no path or trailing slash.
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`: optional; Google sign-in appears
  only when both are nonempty. Configure Google's authorized redirect URI as
  `<PUBLIC_URL>/auth/callback/google`.
- `EMAIL_VERIFICATION_DISABLED`: defaults to `true`; set `false` with a working
  `RESEND_API_KEY` and `EMAIL_FROM` to verify email. Password reset/invitation delivery also needs
  Resend; no mail server is bundled.
- `EMAIL_FROM`: required when `RESEND_API_KEY` is set. Use a sender address on
  your verified Resend domain, for example `Lunaris <notes@example.com>`.
  `EMAIL_REPLY_TO` optionally directs replies to your administrator.
  Hosted founder welcome emails are disabled in self-hosted installations.
- `SELF_HOSTED_PLAN`: `enterprise` by default; existing plan limits still apply
  (currently 1 TB per organization and 5 GB per file). Set through `docker run -e`
  or add it to Compose's environment. No Polar account needed. Features gated
  separately by feature flags retain their existing behavior. This plan setting
  controls quotas; it cannot enable features excluded from a community build.

Production mode remains enabled. `DEPLOYMENT_MODE=self-hosted` explicitly enables
self-hosted entitlement and verification settings; hosted production retains its
existing restrictions. OAuth providers, email, analytics, and third-party agent
services are not provisioned automatically.

Discovery is available at `/.well-known/lunaris-servers` for CLI/desktop clients
and `/.well-known/lunaris-regions` for region selection. Both advertise this
installation's `/v1/manifest` using `PUBLIC_URL`; `/regions.json` remains available
for the bundled web client.

## Persistence, backups, upgrades

Never use `docker compose down -v` unless you intend to erase the installation.
Keep `/data/secrets.env`: losing its encryption key can make existing data unusable.
Do not share a volume between running containers.

For a consistent backup, stop the container and archive the **entire** volume,
including hidden files, PostgreSQL, Garage, Redis, and secrets. Example for the
`docker run` installation above:

```sh
docker stop --time 300 lunaris
mkdir -p backups
docker run --rm -v lunaris-data:/data:ro -v "$PWD/backups:/backup" \
  alpine:3.21 tar czf /backup/lunaris.tar.gz -C /data .
docker start lunaris
```

Encrypt and restrict access to backups. Restore into a new empty volume with the
same image version, preserving numeric ownership, then start with the same
PUBLIC_URL. Test the restored copy before replacing a working installation.
Compose uses a project-prefixed volume; find its exact name with `docker volume ls`.

Before upgrades, take a stopped backup and retain the previous image. Migrations
run automatically; rolling the image back after schema changes may require restoring
that backup. PostgreSQL major mismatches fail closed; use PostgreSQL's documented
migration procedure rather than replacing its binaries over an old data directory.

Component image versions are Docker build arguments. Pin digests for reproducible
releases and rebuild regularly for security fixes. The PowerSync base determines
the Debian distribution and its PostgreSQL package version; check compatibility
before changing it. PostgreSQL replication WAL is capped at 2 GB: after a long sync
outage, a replication-slot reset/full resync may be necessary.

## Diagnostics

```sh
docker compose -f infra/all-in-one/compose.yaml logs --tail=150
docker exec lunaris /opt/aio/healthcheck.sh
docker exec lunaris supervisorctl -c /opt/aio/supervisord.conf status
```

Health checks report PostgreSQL, Redis, API/storage, PowerSync, and web status
without changing data. Any unavailable component marks the container unhealthy;
web/API may still serve during a sync outage. Readiness does not guarantee that
every client has caught up. Supervisor stops sync/API before storage on shutdown.

Supervisor handles unexpected process exits. A separate watchdog waits 90 seconds
at startup, then retries PowerSync after three failed probes, only while PostgreSQL
and the API's JWKS endpoint are reachable. Restart attempts back off from one minute
to 15 minutes; five stable minutes reset the backoff. It restarts only PowerSync,
never PostgreSQL, Redis, Garage, API, or Nginx. Persistent dependency failures stay
visible for operator diagnosis instead of repeatedly restarting healthy services.
For planned sync maintenance, stop the `watchdog` Supervisor program before
stopping `powersync`, then start the watchdog again afterward.
Only bootstrap failure or Supervisor exit ends the container. Avoid external
"autoheal" policies that restart the whole container merely because it is unhealthy.
Health checks do not replace backups.

Upstream references: [PowerSync service](https://github.com/powersync-ja/powersync-service),
[Garage quick start](https://garagehq.deuxfleurs.fr/documentation/quick-start/).

### Internal network isolation

Only Nginx listens on the container network interface (port 8080). API,
PowerSync, Garage, PostgreSQL, and Redis bind to loopback. Other containers
on the Docker network must use Nginx. AIO forces `API_BIND_ADDRESS=127.0.0.1`;
standalone API deployments default to `0.0.0.0` and can set this variable.

PowerSync 1.26.1 hardcodes its bind address. The AIO build patches that specific
listener to loopback and fails if the expected code changes. Review this patch
on PowerSync upgrades. Verify isolation and proxy routing after building:

```sh
bash infra/all-in-one/network-smoke.sh lunaris-aio-lunaris-1
bash infra/all-in-one/smoke.sh http://localhost:8080
```

### Password recovery without email

Without `RESEND_API_KEY`, email recovery is unavailable. Existing reset links
remain valid until expiry. A configured key enables recovery but does not
guarantee mail delivery.

For local recovery, run inside the running AIO container:

```sh
docker compose -f infra/all-in-one/compose.yaml exec lunaris /opt/aio/admin.sh reset-password --email you@example.com
```

Enter the new password twice at the hidden prompts. Requires container root and
an interactive terminal. Passwords never belong in command arguments or environment
variables. Recovery uses Better Auth password policy/hashing and revokes existing
sessions, including Redis sessions. Self-hosted deployments disable session-cookie
caching so revoked sessions stop authenticating immediately. Offline client data
is not remotely erased.

Only existing password accounts can be recovered this way. Google-only accounts
and 2FA settings are unchanged. Old email-reset links remain valid until expiry;
secure the mailbox too if recovery follows a compromise.

Administrative recovery outcomes are stored in `/data/admin-audit.jsonl`, readable
only by root. Records contain user IDs on success, never passwords or reset tokens.
Include this file in volume backups; rotate it according to your retention needs.
