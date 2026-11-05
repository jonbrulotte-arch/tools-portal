#!/bin/sh
set -e
echo "[entrypoint] applying database migrations"
npx prisma migrate deploy
echo "[entrypoint] seeding roles, tools and first admin (idempotent)"
npx tsx prisma/seed.ts
echo "[entrypoint] starting Tools Portal on ${HOSTNAME}:${PORT}"
exec npx next start -H "$HOSTNAME" -p "$PORT"
