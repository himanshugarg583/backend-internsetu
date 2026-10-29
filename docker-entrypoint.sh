#!/bin/sh
set -e

echo "=================================================="
echo " Starting InternSetu Backend"
echo "=================================================="

# Run database migrations
echo "==> Running Prisma database migrations..."
if npx prisma migrate deploy; then
  echo "==> Database migrations applied successfully."
else
  echo "==> [ERROR] Prisma migration deploy failed. Exiting."
  exit 1
fi

echo "==> Starting application server..."
exec "$@"
