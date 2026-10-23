ARG BUN_IMAGE=oven/bun:1.4.0-debian@sha256:5bb0f9be3a1a36a03e27c9a9dd894a3b1ad26657155c7df4dda771e17bf872ef
ARG CADDY_IMAGE=caddy:2.10.2-alpine@sha256:4c6e91c6ed0e2fa03efd5b44747b625fec79bc9cd06ac5235a779726618e530d
FROM ${BUN_IMAGE} AS dependencies
WORKDIR /opt/lunaris
COPY package.json bun.lock bunfig.toml turbo.json tsconfig*.json LICENSE THIRD-PARTY-NOTICES.md ./
COPY apps ./apps
COPY internal ./internal
COPY packages ./packages
COPY extensions ./extensions
COPY ee ./ee
COPY tooling/editions ./tooling/editions
COPY tooling/licenses ./tooling/licenses
COPY tooling/clean-dist.ts tooling/copy-public-assets.ts ./tooling/
COPY patches ./patches
COPY assets ./assets
COPY infra/self-host/package.json ./infra/self-host/package.json
ENV CYPRESS_INSTALL_BINARY=0
RUN --mount=type=cache,target=/root/.bun/install/cache bun install --frozen-lockfile
ARG LUNARIS_EDITION=community
ARG LUNARIS_RUNTIME_CONFIG=false
ARG LUNARIS_BUILD_SHA=local
ENV LUNARIS_EDITION=${LUNARIS_EDITION} VITE_REGION_DIRECTORY_URL=/regions.json LUNARIS_RUNTIME_CONFIG=${LUNARIS_RUNTIME_CONFIG} LUNARIS_BUILD_SHA=${LUNARIS_BUILD_SHA}

FROM dependencies AS build
RUN bun run build --filter=api --filter=web --env-mode=loose
RUN bun tooling/editions/runtime.ts /opt/runtime
FROM build AS runtime
WORKDIR /opt/runtime
RUN --mount=type=cache,target=/root/.bun/install/cache bun install --lockfile-only --ignore-scripts \
    && bun install --production --frozen-lockfile --ignore-scripts

FROM ${BUN_IMAGE} AS api
USER root
RUN mkdir -p /data && chmod 700 /data
COPY --link --from=runtime /opt/runtime /opt/lunaris
COPY --chown=bun:bun infra/self-host/*.ts /opt/lunaris/apps/api/
COPY infra/self-host/admin.sh /usr/local/bin/lunaris-admin
RUN chmod +x /usr/local/bin/lunaris-admin
WORKDIR /opt/lunaris/apps/api
USER bun
ENV NODE_ENV=production DEPLOYMENT_MODE=self-hosted API_BIND_ADDRESS=0.0.0.0 PORT=3000
EXPOSE 3000
CMD ["bun", "dist/src/main.js"]
HEALTHCHECK --interval=15s --timeout=10s --start-period=90s --retries=8 CMD bun -e 'const r = await fetch("http://127.0.0.1:3000/v1/health"); process.exit(r.ok ? 0 : 1)'

FROM ${CADDY_IMAGE} AS web
COPY --from=build /opt/runtime/apps/web/dist /srv
COPY infra/self-host/Caddyfile /etc/caddy/Caddyfile
COPY infra/self-host/web-entrypoint.sh /usr/local/bin/lunaris-web
RUN chmod +x /usr/local/bin/lunaris-web
ENTRYPOINT ["/usr/local/bin/lunaris-web"]
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=5 CMD wget -q -O /dev/null http://127.0.0.1:8081/health

# Hosted targets have separate image names, runtime and migration entrypoints.
# Build with LUNARIS_EDITION=enterprise; never publish them as CE images.
FROM dependencies AS hosted-api-build
RUN bun run build --filter=api --env-mode=loose
RUN bun tooling/editions/runtime.ts /opt/runtime --api-only
FROM hosted-api-build AS hosted-api-runtime
WORKDIR /opt/runtime
RUN --mount=type=cache,target=/root/.bun/install/cache bun install --lockfile-only --ignore-scripts \
    && bun install --production --frozen-lockfile --ignore-scripts

FROM dependencies AS hosted-web-build
RUN bun run build --filter=web --env-mode=loose
RUN NODE_ENV=production bun build apps/web/serve.ts --target bun --outfile /opt/web-server/serve.js

FROM ${BUN_IMAGE} AS hosted-api
ARG LUNARIS_BUILD_SHA
ENV NODE_ENV=production LUNARIS_BUILD_SHA=${LUNARIS_BUILD_SHA} PORT=3000
COPY --link --from=hosted-api-runtime /opt/runtime /opt/lunaris
WORKDIR /opt/lunaris/apps/api
COPY --chown=bun:bun infra/hosted/migrate.ts ./migrate.ts
USER bun
EXPOSE 3000
CMD ["bun", "dist/src/main.js"]

FROM ${BUN_IMAGE} AS hosted-web
ARG LUNARIS_BUILD_SHA
ENV NODE_ENV=production LUNARIS_BUILD_SHA=${LUNARIS_BUILD_SHA} PORT=3000
COPY --from=hosted-web-build /opt/lunaris/apps/web/dist /opt/web/dist
COPY --from=hosted-web-build /opt/web-server/serve.js /opt/web/serve.js
WORKDIR /opt/web
USER bun
EXPOSE 3000
CMD ["bun", "serve.js"]
