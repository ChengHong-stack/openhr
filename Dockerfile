# ---------- build ----------
FROM node:22-alpine AS build
WORKDIR /app
# Copy only what `npm ci` (and its postinstall `prisma generate`) needs, so this layer stays
# cached until dependencies or the schema change — not on every code, seed or migration edit.
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma/schema.prisma ./prisma/schema.prisma
RUN npm ci --no-audit --no-fund
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx next build

# ---------- run ----------
FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    UPLOAD_DIR=/data/uploads \
    NEXT_TELEMETRY_DISABLED=1
RUN apk add --no-cache su-exec \
 && addgroup -S app && adduser -S app -G app && mkdir -p /data/uploads && chown -R app:app /data
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/prisma ./prisma
COPY --from=build --chown=app:app /app/scripts ./scripts
EXPOSE 3000
# Uploads live in /data/uploads: attach persistent storage there (docker-compose.yml and Railway both do).
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD wget -qO- http://127.0.0.1:${PORT:-3000}/api/health >/dev/null || exit 1
# Mounted storage (e.g. on Railway) arrives root-owned: fix ownership, then drop to the app user.
# Apply migrations, insert reference data on first boot, then serve.
CMD ["sh", "-c", "mkdir -p \"$UPLOAD_DIR\" && chown app:app \"$UPLOAD_DIR\" && exec su-exec app sh -c 'node scripts/migrate.mjs && node prisma/seed.mjs && exec node server.js'"]
