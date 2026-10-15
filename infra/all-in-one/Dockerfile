# syntax=docker/dockerfile:1
ARG POWERSYNC_IMAGE=journeyapps/powersync-service:1.26.1
ARG BUN_IMAGE=oven/bun:1.4.0-debian
ARG GARAGE_IMAGE=dxflrs/garage:v1.3.1
FROM ${BUN_IMAGE} AS build
WORKDIR /opt/lunaris
COPY . .
ENV CYPRESS_INSTALL_BINARY=0
RUN bun install --frozen-lockfile
ARG LUNARIS_EDITION=community
ENV LUNARIS_EDITION=${LUNARIS_EDITION}
ENV VITE_REGION_DIRECTORY_URL=/regions.json
RUN bun run build --filter=api --filter=web --env-mode=loose

# Assemble only runtime workspaces; community output never copies ee/ or landing.
RUN bun tooling/editions/runtime.ts /opt/runtime
WORKDIR /opt/runtime
# Manifests are pruned; derive the runtime lock from the frozen source lock above.
RUN bun install --lockfile-only --ignore-scripts \
    && bun install --production --frozen-lockfile --ignore-scripts

FROM ${GARAGE_IMAGE} AS garage
FROM ${POWERSYNC_IMAGE}
USER root
# Keep PowerSync's Node runtime and native dependencies in their original image.
RUN apt-get update && apt-get install -y --no-install-recommends \
    postgresql-17 redis-server nginx supervisor curl openssl gosu ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --create-home lunaris \
    && mkdir -p /data /run/lunaris \
    && chown -R lunaris:lunaris /app/.probes /workspace
COPY --from=build /usr/local/bin/bun /usr/local/bin/bun
COPY --from=build /opt/runtime /opt/lunaris
COPY --from=garage /garage /usr/local/bin/garage
COPY infra/all-in-one /opt/aio
RUN node /opt/aio/bind-powersync-loopback.mjs
COPY infra/all-in-one/admin.ts /opt/lunaris/apps/api/aio-admin.ts
COPY infra/all-in-one/migrate.ts /opt/lunaris/apps/api/aio-migrate.ts
COPY infra/local/config/sync_rules.yaml /app/sync_rules.yaml
COPY infra/all-in-one/powersync.yaml /app/powersync.yaml
RUN chmod +x /opt/aio/*.sh && rm -f /etc/nginx/sites-enabled/default \
    && ln -s /opt/aio/nginx.conf /etc/nginx/conf.d/lunaris.conf
ENV NODE_ENV=production DEPLOYMENT_MODE=self-hosted
EXPOSE 8080
VOLUME ["/data"]
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=15s --start-period=180s --retries=3 CMD /opt/aio/healthcheck.sh
ENTRYPOINT ["/opt/aio/entrypoint.sh"]
