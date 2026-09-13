# Hardpull API. Built from the REPO ROOT, not from api/, because this is a pnpm workspace and
# the API depends on two workspace packages (@hardpull/types, @hardpull/sdk-node):
#
#   docker build -f api/Dockerfile -t hardpull-api .
#
# Runtime config is entirely environment variables -- see api/.env.example. The image holds no
# secrets and no chain addresses.
FROM node:20-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable

FROM base AS build
WORKDIR /repo

# bufferutil and utf-8-validate are optional native addons pulled in transitively by ws; on
# alpine they have no prebuilt binary and fall back to node-gyp, which needs a toolchain.
RUN apk add --no-cache python3 make g++

# Copy only the manifests first so a dependency-free code change reuses the install layer.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/types/package.json packages/types/
COPY sdk-node/package.json sdk-node/
COPY api/package.json api/
RUN pnpm install --frozen-lockfile --filter @hardpull/api... --filter @hardpull/types --filter @hardpull/sdk-node

COPY tsconfig.base.json ./
COPY packages/types packages/types
COPY sdk-node sdk-node
COPY api/openapi.yaml api/openapi.yaml
COPY api api

# sdk-node generates its client from api/openapi.yaml, so the spec must be present first.
RUN pnpm --filter @hardpull/types build \
 && pnpm --filter @hardpull/sdk-node build

FROM base AS runtime
WORKDIR /repo
ENV NODE_ENV=production

COPY --from=build /repo /repo

EXPOSE 3001
# Migrations are deliberately NOT run on boot: a container restart must never silently alter the
# schema of a database holding financial records. Run them as an explicit deploy step:
#   pnpm --filter @hardpull/api exec node-pg-migrate up -m src/db/migrations
#
# tsx runs the TypeScript sources directly, matching how the service runs in development, so
# there is no separate build output to keep in sync.
CMD ["pnpm", "--filter", "@hardpull/api", "exec", "tsx", "src/index.ts"]
