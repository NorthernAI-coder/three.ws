# Hyperfy — world.three.ws
# Multi-stage: build Hyperfy from source, then produce a lean production image.
# The /world volume (GCS bucket in production) holds SQLite + uploaded assets so
# the container itself is stateless and can be rebuilt without losing world data.

FROM node:22-alpine AS source
WORKDIR /app
RUN apk add --no-cache git python3 make g++
# Pinned upstream commit so a rebuild never silently pulls new Hyperfy code.
# Update this hash deliberately when pulling in upstream improvements, and
# re-verify the patches in patches/ still apply.
ARG HYPERFY_REF=5d20037435a1d86cda088382bb12737e9f18d5f6
RUN git init -q . \
  && git remote add origin https://github.com/hyperfy-xyz/hyperfy.git \
  && git fetch --depth 1 origin ${HYPERFY_REF} \
  && git checkout -q FETCH_HEAD
# Server-side hardening: enforce PUBLIC_MAX_UPLOAD_SIZE on /api/upload itself
# (upstream hard-codes a 200MB multipart cap on an unauthenticated route).
COPY patches/ /tmp/patches/
RUN git apply --verbose /tmp/patches/*.patch

FROM source AS builder
RUN npm ci
RUN npm run build 2>&1 || true

FROM node:22-alpine AS runner
WORKDIR /app
RUN addgroup -S hyperfy && adduser -S hyperfy -G hyperfy
# Copy only what the server needs at runtime.
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src ./src
COPY --from=builder /app/public ./public 2>/dev/null || true
# /world is the persistence mount point — SQLite db + uploaded assets land here.
RUN mkdir -p /world && chown hyperfy:hyperfy /world
USER hyperfy
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s \
  CMD wget -qO- http://localhost:3000/ || exit 1
CMD ["npm", "start"]
