# syntax=docker/dockerfile:1.7
ARG NODE_IMAGE=node:24.21.0-alpine

FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN npm i -g pnpm@10.34.5 && apk add --no-cache tini
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml .npmrc ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
# prisma.config.ts reads DATABASE_URL via env(), which throws when unset; generate never connects,
# so the placeholder is scoped to this one command and never becomes an image ENV.
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build pnpm prisma generate \
 && pnpm build                                     # next.config.ts: output: "standalone"

# ── Migration image: Prisma CLI + schema only ──
FROM deps AS migrate
COPY prisma ./prisma
COPY prisma.config.ts ./
# The schema engine is fetched by @prisma/engines' postinstall (allow-listed in package.json
# `pnpm.onlyBuiltDependencies`). Verify it is present now — the runtime network has no egress —
# and let the unprivileged user own the directory so the CLI never tries to write as root.
# pnpm (installed by npm in `base`) is self-contained; the migration image never runs npm, npx,
# corepack or yarn, so they leave with their bundled dependencies (Trivy flags npm's).
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build pnpm prisma --version \
 && chown -R node:node /app/node_modules/.pnpm/@prisma+engines* \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-v* \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg
USER node
ENTRYPOINT ["tini", "--"]
CMD ["pnpm", "prisma", "migrate", "deploy"]

# ── Runtime image ──
FROM ${NODE_IMAGE} AS runner
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
# The runtime only runs `node server.js`: npm, npx, corepack and yarn leave with their bundled
# dependencies (Trivy flags npm's), which also keeps the image smaller.
RUN apk add --no-cache tini && addgroup -S -g 1001 app && adduser -S -u 1001 -G app app \
 && mkdir -p /data/storage && chown -R app:app /data \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-v* \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg
WORKDIR /app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s CMD wget -qO- http://127.0.0.1:3000/api/health/live || exit 1
ENTRYPOINT ["tini", "--"]
CMD ["node", "server.js"]
