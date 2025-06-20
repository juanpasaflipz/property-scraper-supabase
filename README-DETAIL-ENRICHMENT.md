# Detail Enrichment System

## Overview
The detail enrichment system runs **completely independently** from your main scraping system. It enhances existing properties with detailed information without interfering with the primary data collection.

## Architecture
```
Main Scraper (6AM, 6PM) → Collects basic property listings
     ↓
Database (properties table)
     ↓
Detail Enrichment (Every hour) → Adds detailed info to existing properties
```

## Key Features
- **Independent Process**: Runs as a separate PM2 service
- **Non-Intrusive**: Never modifies the main scraping logic
- **Smart Scheduling**: Runs hourly but skips if nothing to process
- **Rate Limited**: Processes only 30 properties per run to avoid blocking
- **Fault Tolerant**: Failures don't affect main scraper

## Setup Instructions

### 1. First Time Setup
```bash
# Run database migration (one time only)
node migrations/add-detail-fields.js

# Test the detail scraper
node test-detail-scraper.js
```

### 2. Start the Service
```bash
# Easy way - use the start script
./scripts/start-enrichment.sh

# Or manually with PM2
pm2 start ecosystem.config.js --only detail-enrichment
```

### 3. Monitor Progress
```bash
# Check enrichment status
node scripts/monitor-enrichment.js

# Watch continuously
node scripts/monitor-enrichment.js --watch

# View logs
pm2 logs detail-enrichment
```

## Configuration

The service is configured in `ecosystem.config.js`:
- **Development**: Runs every 2 hours, processes 30 properties
- **Production**: Runs every hour, processes 30 properties

To adjust:
```javascript
env_production: {
  DETAIL_ENRICHMENT_INTERVAL: '60' // Minutes between runs
}
```

## What Gets Enriched

Each property gets enhanced with:
- Full description (up to 5000 chars)
- Complete address and neighborhood
- All property images (not just thumbnail)
- Detailed specifications (areas, rooms, parking)
- Amenities list (pool, gym, security, etc.)
- Property features and technical specs
- Seller information
- View count and publish date

## Database Impact

New columns added (backward compatible):
- `description` (TEXT)
- `full_address` (TEXT)
- `neighborhood` (VARCHAR)
- `total_area_sqm` (NUMERIC)
- `built_area_sqm` (NUMERIC)
- `parking_spaces` (INTEGER)
- `amenities` (JSONB)
- `features` (JSONB)
- `images` (JSONB)
- `detail_scraped` (BOOLEAN)

## Performance Considerations

- Processes 30 properties per hour = 720 per day
- Each property takes 2-3 seconds to enrich
- Total time per run: ~90 seconds
- Memory usage: ~200MB
- Network: 30 requests per hour

## Troubleshooting

### Service Won't Start
```bash
# Check PM2 status
pm2 status

# Check error logs
pm2 logs detail-enrichment --err
```

### Not Processing Properties
```bash
# Check if properties need enrichment
node scripts/monitor-enrichment.js

# Manually run enrichment
node run-detail-enrichment.js --limit 5
```

### Rate Limiting Issues
- Reduce properties per run in `detail-enrichment-service.js`
- Increase interval between runs
- Add proxy support if needed

## Stopping the Service
```bash
# Stop temporarily
pm2 stop detail-enrichment

# Remove completely
pm2 delete detail-enrichment
```

## Integration with Main System

The detail enrichment:
- ✅ Runs independently via PM2
- ✅ Uses same database but different columns
- ✅ Has separate logs and error handling
- ✅ Can be stopped/started without affecting main scraper
- ✅ Automatically skips if all properties have details

## Best Practices

1. **Let it run continuously** - It self-manages and skips when not needed
2. **Monitor weekly** - Check success rates and errors
3. **Don't run manually** during business hours (9 AM - 6 PM)
4. **Export enriched data** for analysis:
   ```bash
   node scripts/export-enriched-properties.js
   ```

## Future Enhancements

Consider adding:
- Webhook notifications when enrichment completes
- Priority queue for new/premium listings
- Image analysis and quality scoring
- Automatic translation of descriptions
- Price history tracking