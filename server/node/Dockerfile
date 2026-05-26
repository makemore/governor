# syntax=docker/dockerfile:1.7
#
# Governor reference server (Node + Hono + SQLite).
#
# Build context MUST be the `governor/` directory (parent of `server/`),
# so the build can see both `server/node/` and the local `@governor/core`
# package at `core/ts/`. From the repo root:
#
#   docker build -f governor/server/node/Dockerfile -t governor governor
#
# Persistence: mount a volume at /data. Without it the SQLite database
# lives in the container's writable layer and disappears on restart.

# ---------- build stage ----------
FROM node:20-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /build

# Bring in the core library and compile it. The server depends on
# @governor/core via a file: path; we use --install-links below so npm
# copies it into node_modules rather than symlinking out of the image.
COPY core/ts/package.json core/ts/tsconfig.json core/ts/tsconfig.build.json ./core/ts/
COPY core/ts/src ./core/ts/src
RUN cd core/ts && npm install --no-audit --no-fund && npx tsc -p tsconfig.build.json

# Install server deps (compiles better-sqlite3 against this Node version).
COPY server/node/package.json server/node/tsconfig.json ./server/node/
RUN cd server/node && npm install --install-links --no-audit --no-fund

# Build TypeScript.
COPY server/node/src ./server/node/src
COPY server/node/migrations ./server/node/migrations
RUN cd server/node && npm run build

# ---------- litestream stage ----------
# Vendor the litestream binary so the runtime image can replicate
# SQLite to any S3-compatible bucket (R2, B2, S3, MinIO, Wasabi).
# Pinning the version keeps image builds reproducible.
FROM debian:bookworm-slim AS litestream
ARG LITESTREAM_VERSION=0.3.13
ARG TARGETARCH
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates wget \
 && rm -rf /var/lib/apt/lists/* \
 && case "${TARGETARCH:-amd64}" in \
      amd64) LS_ARCH=amd64 ;; \
      arm64) LS_ARCH=arm64 ;; \
      *) echo "unsupported arch: ${TARGETARCH}" >&2; exit 1 ;; \
    esac \
 && wget -qO /tmp/litestream.tar.gz \
      "https://github.com/benbjohnson/litestream/releases/download/v${LITESTREAM_VERSION}/litestream-v${LITESTREAM_VERSION}-linux-${LS_ARCH}.tar.gz" \
 && tar -xzf /tmp/litestream.tar.gz -C /usr/local/bin litestream \
 && rm /tmp/litestream.tar.gz \
 && /usr/local/bin/litestream version

# ---------- runtime stage ----------
FROM node:20-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates wget \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd -r governor && useradd -r -g governor -d /home/governor -m governor
WORKDIR /app

# node_modules contains a real copy of @governor/core thanks to --install-links.
COPY --from=build /build/server/node/node_modules ./node_modules
COPY --from=build /build/server/node/dist ./dist
COPY --from=build /build/server/node/migrations ./migrations
COPY --from=build /build/server/node/package.json ./package.json
COPY --from=litestream /usr/local/bin/litestream /usr/local/bin/litestream
COPY server/node/docker-entrypoint.sh /usr/local/bin/governor-entrypoint.sh
RUN chmod +x /usr/local/bin/governor-entrypoint.sh

ENV NODE_ENV=production \
    PORT=8080 \
    GOVERNOR_DB_PATH=/data/governor.sqlite

RUN mkdir -p /data && chown -R governor:governor /data /app
VOLUME ["/data"]
USER governor
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/ >/dev/null 2>&1 || exit 1

ENTRYPOINT ["/usr/local/bin/governor-entrypoint.sh"]
