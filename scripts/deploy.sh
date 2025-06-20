#!/bin/bash

# Production deployment script
set -e

echo "🚀 Starting production deployment..."

# Check environment
if [ "$NODE_ENV" != "production" ]; then
    echo "⚠️  Warning: NODE_ENV is not set to production"
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Pull latest code
echo "📦 Pulling latest code..."
git pull origin main

# Install dependencies
echo "📦 Installing dependencies..."
npm ci --production

# Run database migrations
echo "🗄️  Running database migrations..."
node scripts/migrate.js

# Test database connection
echo "🔍 Testing database connection..."
node scripts/test-connection.js

# Build/compile if needed
if [ -f "build.js" ]; then
    echo "🏗️  Building application..."
    node build.js
fi

# Restart PM2 services
echo "🔄 Restarting services..."
pm2 reload ecosystem.config.js --env production

# Check service status
echo "✅ Checking service status..."
pm2 status

echo "✅ Deployment complete!"
echo "📊 View logs with: pm2 logs"