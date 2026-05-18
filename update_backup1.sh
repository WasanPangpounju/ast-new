#!/bin/bash
set -e

echo "🔄 Pulling latest code..."
git pull origin main

echo "📦 Installing dependencies..."
npm install

echo "🐘 Starting postgres (if not running)..."
docker compose up -d postgres

echo "⏳ Waiting for postgres to be ready..."
until docker compose exec postgres pg_isready -U postgres -q; do
  sleep 1
done

echo "🗄️ Running Prisma migrations in Docker..."
docker compose up migrate --force-recreate
docker compose rm -f migrate

echo "⚙️ Generating Prisma client..."
npx prisma generate

echo ""
echo "✅ Update complete!"
echo ""

# ถ้า npm run dev กำลังรันอยู่ ให้ kill แล้วรันใหม่
DEV_PID=$(lsof -ti :3000 2>/dev/null || true)
if [ -n "$DEV_PID" ]; then
  echo "🔁 Restarting dev server (killing PID $DEV_PID)..."
  kill "$DEV_PID"
  sleep 1
fi

echo "🚀 Starting dev server..."
npm run dev
