# PM2 Setup Complete! 🎉

## ✅ Current Status
All your services are now running under PM2:

| Service | Status | Description |
|---------|--------|-------------|
| **property-scraper** | ✅ Running | Main API service |
| **scraper-cron** | ✅ Running | Runs at 6 AM & 6 PM daily |
| **detail-enrichment** | ✅ Running | Enriches properties every 2 hours |

## 📊 Essential PM2 Commands

### Check Status
```bash
pm2 status          # See all services
pm2 list            # Same as status
pm2 monit           # Real-time monitoring
```

### View Logs
```bash
pm2 logs                    # View all logs
pm2 logs detail-enrichment  # View specific service logs
pm2 logs --lines 50        # View last 50 lines
```

### Control Services
```bash
pm2 stop all               # Stop all services
pm2 restart all            # Restart all services
pm2 reload all             # Zero-downtime reload

pm2 stop detail-enrichment    # Stop specific service
pm2 restart scraper-cron      # Restart specific service
```

### Save Configuration
```bash
pm2 save                   # Save current process list
pm2 resurrect              # Restore saved processes
```

## 🚀 Make PM2 Start on Boot (Optional)

To make PM2 start automatically when your Mac restarts:

```bash
# Copy and run this command:
sudo env PATH=$PATH:/opt/homebrew/Cellar/node/23.11.0/bin /opt/homebrew/lib/node_modules/pm2/bin/pm2 startup launchd -u juan --hp /Users/juan

# Then save the process list:
pm2 save
```

## 📁 Log Locations

Your logs are stored in:
- Main logs: `./logs/`
- PM2 logs: `~/.pm2/logs/`

View logs:
```bash
tail -f logs/detail-enrichment-out.log   # Detail enrichment output
tail -f logs/err.log                     # Error logs
```

## 🔧 Configuration

To change service behavior, edit `ecosystem.config.cjs`:
- Change cron schedule for scrapers
- Adjust memory limits
- Modify environment variables

After changes:
```bash
pm2 reload ecosystem.config.cjs
```

## 🏥 Health Monitoring

Check if everything is healthy:
```bash
# Check enrichment progress
node scripts/monitor-enrichment.js

# Check PM2 health
pm2 info detail-enrichment
```

## ⚠️ Troubleshooting

If a service keeps crashing:
```bash
pm2 describe detail-enrichment  # Get detailed info
pm2 logs detail-enrichment --err  # Check error logs
pm2 reset detail-enrichment     # Reset restart counter
```

## 🛑 Stopping PM2

When you're done:
```bash
pm2 stop all     # Stop all services
pm2 delete all   # Remove all services
pm2 kill         # Stop PM2 daemon
```

## 📊 Current Schedule

- **Main Scraper**: 6:00 AM & 6:00 PM daily
- **Detail Enrichment**: Every 2 hours (development mode)
- **Both run independently** - no conflicts!

---

Your property scraper is now professionally managed with PM2! 🚀