# syntax=docker/dockerfile:1.7

ARG BUN_VERSION=1.3.11

FROM oven/bun:${BUN_VERSION}-alpine AS base
WORKDIR /repo

FROM base AS deps
# Every workspace package.json must be present or the frozen install fails:
# bun checks the lockfile's workspace set against what it finds on disk.
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/ui/package.json packages/ui/
COPY e2e/package.json e2e/
RUN bun install --frozen-lockfile

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN cd apps/api && bun build ./src/index.ts \
    --target=bun \
    --outdir=dist \
    --minify

FROM oven/bun:${BUN_VERSION}-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /repo/apps/api/dist ./dist
COPY --from=deps  /repo/node_modules ./node_modules
# The bundle carries every JS dependency but not a native binding: the libsql
# driver requires `@libsql/<platform>` by name at startup. bun's isolated linker
# keeps it under node_modules/.bun, whose hoisted view is .bun/node_modules.
# Without this the image builds green and dies on boot with "Cannot find module".
ENV NODE_PATH=/app/node_modules/.bun/node_modules
COPY --from=deps  /repo/apps/api/package.json ./package.json
EXPOSE 3001
CMD ["bun", "run", "dist/index.js"]
