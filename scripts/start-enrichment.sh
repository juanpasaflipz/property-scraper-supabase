#!/bin/bash

# Script to safely start detail enrichment without affecting main scraper

echo "🚀 Starting Detail Enrichment Service"
echo "This runs independently from the main property scraper"
echo ""

# Check if main scraper is running
if pm2 status | grep -q "scraper-cron.*online"; then
    echo "✅ Main scraper is running - OK to proceed"
else
    echo "⚠️  Warning: Main scraper is not running"
fi

echo ""

# Start only the detail enrichment service
echo "Starting detail enrichment service..."
pm2 start ecosystem.config.js --only detail-enrichment

# Show status
echo ""
echo "📊 Current PM2 Status:"
pm2 status

echo ""
echo "✅ Detail enrichment service started!"
echo ""
echo "📝 Useful commands:"
echo "  - View logs: pm2 logs detail-enrichment"
echo "  - Monitor: node scripts/monitor-enrichment.js"
echo "  - Stop: pm2 stop detail-enrichment"
echo "  - Restart: pm2 restart detail-enrichment"
echo ""
echo "The service will:"
echo "  - Run every 60 minutes in production (120 in dev)"
echo "  - Process 30 properties per run"
echo "  - Only enrich properties without details"
echo "  - Not interfere with main scraping"