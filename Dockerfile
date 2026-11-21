# ---------- build ----------
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci
COPY . .
RUN npx prisma generate && npx next build

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
VOLUME ["/data/uploads"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD wget -qO- http://127.0.0.1:3000/login >/dev/null || exit 1
# Mounted disks (e.g. Render) arrive root-owned: fix ownership, then drop to the app user.
# Apply migrations, insert reference data on first boot, then serve.
CMD ["sh", "-c", "mkdir -p \"$UPLOAD_DIR\" && chown -R app:app \"$UPLOAD_DIR\" && exec su-exec app sh -c 'node scripts/migrate.mjs && node prisma/seed.mjs && exec node server.js'"]
