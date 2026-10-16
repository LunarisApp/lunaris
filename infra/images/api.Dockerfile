# syntax=docker/dockerfile:1
ARG BUN_IMAGE=oven/bun:1.4.0-debian
FROM ${BUN_IMAGE} AS build
WORKDIR /opt/lunaris
COPY . .
ENV CYPRESS_INSTALL_BINARY=0 LUNARIS_EDITION=community
RUN --mount=type=cache,target=/root/.bun/install/cache bun install --frozen-lockfile --network-concurrency=16
RUN bun run build --filter=api --env-mode=loose
RUN bun tooling/editions/runtime.ts /opt/runtime --api-only
WORKDIR /opt/runtime
RUN bun install --lockfile-only --ignore-scripts && bun install --production --frozen-lockfile --ignore-scripts

FROM ${BUN_IMAGE}
WORKDIR /opt/lunaris/apps/api
COPY --from=build --chown=bun:bun /opt/runtime /opt/lunaris
COPY --chown=bun:bun infra/images/migrate.ts ./migrate.ts
ENV NODE_ENV=production DEPLOYMENT_MODE=self-hosted PORT=3000
USER bun
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s CMD bun -e 'const r = await fetch(`http://127.0.0.1:${process.env.PORT}/v1/health`); process.exit(r.ok ? 0 : 1)'
CMD ["bun", "dist/src/main.js"]
