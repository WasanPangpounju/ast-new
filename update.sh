#!/bin/bash
echo "🔄 Pulling latest code..."
git pull origin main

echo "📦 Installing dependencies..."
npm install

echo "🗄️ Deploying Prisma migrations..."
npx prisma migrate deploy
npx prisma generate

echo "✅ Done! Run: npm run dev"
