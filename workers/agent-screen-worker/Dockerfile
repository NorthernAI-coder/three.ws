# agent-screen-worker — long-lived browser capture worker.
#
# Build from the worker directory:
#
#   docker build -t agent-screen-worker .
#   docker run --env-file .env agent-screen-worker
#
# For Browserbase cloud mode, omit the playwright install step and
# set BROWSERBASE_API_KEY + BROWSERBASE_PROJECT_ID in your env.
# The Playwright base image is only needed for LOCAL browser mode.

FROM mcr.microsoft.com/playwright:v1.44.0-jammy

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY . .

# Pre-install Chromium for LOCAL browser mode.
# If you only use Browserbase, this layer can be skipped by building with
# --build-arg SKIP_BROWSERS=1 and adjusting the RUN command below.
ARG SKIP_BROWSERS=0
RUN if [ "$SKIP_BROWSERS" = "0" ]; then npx playwright install chromium --with-deps; fi

CMD ["node", "index.js"]
