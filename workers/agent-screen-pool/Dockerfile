# syntax=docker/dockerfile:1
# agent-screen-pool — on-demand Chromium caster pool.
# Base ships Chromium + all system deps. Pin to the playwright package version.
FROM mcr.microsoft.com/playwright:v1.49.0-jammy

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY . .

# Chromium is baked into the base image at /ms-playwright.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV NODE_ENV=production \
    BASE_URL=https://three.ws \
    MAX_BROWSERS=6 \
    POLL_MS=3000 \
    FRAME_MS=700 \
    JPEG_QUALITY=58

# SCREEN_WORKER_SECRET must be supplied at runtime (-e SCREEN_WORKER_SECRET=…).
USER pwuser

CMD ["node", "index.js"]
