# agent-sniper — long-lived Node worker.
#
# Build from the REPO ROOT (it imports api/_lib/* and the @three-ws/agent-payments
# workspace, so it needs the full install):
#
#   docker build -f workers/agent-sniper/Dockerfile -t agent-sniper .
#   docker run --env-file .env agent-sniper
#
# Deploy target is Cloud Run (no HTTP port — it's a background worker; deploy
# with --no-cpu-throttling so the feed stays connected between requests).

FROM node:24-slim

WORKDIR /app

# Install deps first for layer caching. postinstall builds the agent-payments
# SDK (dist/) that the trade client imports.
COPY package.json package-lock.json* ./
COPY agent-payments-sdk/package.json ./agent-payments-sdk/
RUN npm ci --omit=dev --ignore-scripts || npm install --omit=dev --ignore-scripts

# Bring in source needed at runtime, then build the SDK explicitly (ignore-scripts
# skipped the postinstall build above).
COPY agent-payments-sdk ./agent-payments-sdk
COPY api ./api
COPY workers/agent-sniper ./workers/agent-sniper
RUN npm run build --prefix agent-payments-sdk

ENV NODE_ENV=production \
    SNIPER_MODE=simulate

CMD ["node", "workers/agent-sniper/index.js"]
