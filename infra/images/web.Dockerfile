# syntax=docker/dockerfile:1
ARG BUN_IMAGE=oven/bun:1.4.0-debian
FROM ${BUN_IMAGE} AS build
WORKDIR /opt/lunaris
COPY . .
ENV CYPRESS_INSTALL_BINARY=0 LUNARIS_EDITION=community VITE_REGION_DIRECTORY_URL=/regions.json
RUN --mount=type=cache,target=/root/.bun/install/cache bun install --frozen-lockfile --network-concurrency=16
RUN bun run build --filter=web --env-mode=loose
RUN bun build infra/images/web.ts --target=bun --define import.meta.main=false --outfile=/opt/server/server.js

FROM ${BUN_IMAGE}
WORKDIR /opt/lunaris
COPY --from=build --chown=bun:bun /opt/server/server.js ./server.js
COPY --from=build --chown=bun:bun /opt/lunaris/apps/web/dist ./dist
COPY LICENSE THIRD-PARTY-NOTICES.md ./
ENV NODE_ENV=production PORT=3000
USER bun
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s CMD bun -e 'const r = await fetch(`http://127.0.0.1:${process.env.PORT}/health`); process.exit(r.ok ? 0 : 1)'
CMD ["bun", "server.js"]
