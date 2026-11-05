# Tools Portal production image (Next.js + Prisma). See docker-compose.yml.
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && apt-get clean
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
# prisma generate (postinstall) only needs a syntactically valid URL at build time
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build npm ci

FROM deps AS build
WORKDIR /app
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build DISABLE_SCHEDULER=true npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates tini && apt-get clean \
  && groupadd -r app && useradd -r -g app -d /app app && mkdir -p /app/backups && chown app:app /app /app/backups
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=8016 HOSTNAME=0.0.0.0 BACKUP_DIR=/app/backups
COPY --from=build --chown=app:app /app/package.json /app/next.config.ts /app/prisma.config.ts /app/tsconfig.json ./
COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/.next ./.next
COPY --from=build --chown=app:app /app/public ./public
COPY --from=build --chown=app:app /app/prisma ./prisma
COPY --from=build --chown=app:app /app/src ./src
COPY --chown=app:app docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
USER app
EXPOSE 8016
VOLUME ["/app/backups"]
ENTRYPOINT ["/usr/bin/tini", "--", "/entrypoint.sh"]
