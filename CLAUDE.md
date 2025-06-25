# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Node.js property scraper application that collects real estate listings from Mexican portals (MercadoLibre and Lamudi) and stores them in a Supabase PostgreSQL database. The system includes automated scheduling, deduplication, detail enrichment, and a REST API.

## Key Commands

### Development

```bash
npm install                   # Install dependencies
npm run migrate              # Create database schema
npm start                    # Run basic scraper
npm run dev                  # Run with watch mode
npm run server               # Start API server on port 3000
npm run server:dev           # API server with watch mode
```

### PM2 Process Management

```bash
pm2 start ecosystem.config.js --env production  # Start all services
pm2 status                   # Check service status
pm2 logs                     # View all logs
pm2 logs detail-enrichment   # View specific service logs
pm2 restart all              # Restart all services
pm2 stop all                 # Stop all services
```

### Manual Scraping

```bash
# MercadoLibre
node src/index.js scrape "https://inmuebles.mercadolibre.com.mx/departamentos/renta/" 5
node src/index.js stats
node src/index.js search 1000000 5000000 3

# Lamudi
node src/scrapers/lamudi-scraper.js "mexico city" "rent"

# Multi-source automated
node src/scheduler-multi-source.js run    # Run once
node src/scheduler-multi-source.js start  # Start scheduler
node src/scheduler-multi-source.js stats  # View statistics
```

### Health Checks & Monitoring

```bash
node check-db.js                      # Test database connection
node scripts/health-check.js          # Full health check
node scripts/monitor-enrichment.js    # Monitor detail enrichment progress
```

## Architecture

### Core Components

1. **Scrapers** (`src/scrapers/`)
   - `mercadolibre-scraper.js` - Basic MercadoLibre scraper
   - `mercadolibre-maximized.js` - Enhanced version with better extraction
   - `lamudi-scraper.js` - Lamudi portal scraper
   - `scrapedo-mercadolibre.js` - Integration with Scrape.do proxy service

2. **Database** (`src/db/`)
   - `database.js` - PostgreSQL connection management via Supabase
   - `property-repository.js` - Database operations for properties
   - `property-repository-csv.js` - CSV export functionality

3. **Services** (`src/services/`)
   - `automated-scraper.js` - Main automated scraping service
   - `detail-enrichment-service.js` - Enriches properties with detailed info
   - `detail-scraping-queue.js` - Queue management for detail scraping

4. **API** (`src/api/`)
   - `scraper-api-multi-source.js` - REST API for manual triggers and stats

### PM2 Services

The application runs three PM2 processes defined in `ecosystem.config.js`:

- **property-scraper**: Main API service
- **scraper-cron**: Automated scraping (6 AM & 6 PM daily)
- **detail-enrichment**: Property detail enrichment (every 2 hours in dev, hourly in production)

### Database Schema

The `properties` table is the core data structure with 40+ columns including:

- Basic info: `external_id`, `title`, `price`, `currency`, `location`
- Details: `bedrooms`, `bathrooms`, `size`, `property_type`
- Metadata: `source`, `created_at`, `updated_at`, `last_seen_at`
- Enrichment: `detail_scraped`, `amenities`, `features`, `images`

## Environment Configuration

Required environment variables (see `.env.example`):

```env
NEXT_PUBLIC_SUPABASE_URL      # Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY # Supabase anonymous key
DATABASE_URL                  # PostgreSQL connection string
SCRAPEDO_TOKEN               # Optional: Scrape.do API token
```

## Common Issues & Solutions

1. **Logger Error**: `this.logger.warn is not a function` in `mercadolibre-maximized.js:259,292`
   - The logger doesn't have a `warn` method, use `logger.info` or `logger.error` instead

2. **Database Close Error**: `db.close is not a function`
   - Use `db.disconnect()` instead of `db.close()`

3. **Lamudi 403 Errors**: Lamudi blocks requests without proper headers
   - Update user-agent and add necessary headers in lamudi-scraper.js

4. **Network Timeouts**: Default timeout is 45 seconds
   - Can be adjusted in scraper configuration
   - Consider implementing retry logic with exponential backoff

## Testing & Debugging

```bash
# Test scrapers
node test-scraper.js
node test-lamudi-listings.js
node test-detail-scraper.js

# Debug mode
NODE_ENV=production DEBUG=* node src/index.js

# Check scraper status
node check-scraper-status.js
```

## Production Deployment

See `README-PRODUCTION.md` for detailed deployment instructions. Key points:

- Use PM2 for process management
- Enable Supabase Row Level Security (RLS)
- Configure proper environment variables
- Set up monitoring and health checks
- Implement backup strategy

## State Management

The system maintains state in several files:

- `scraper-state.json` - Tracks scraping runs and statistics
- `data/detail-enrichment-state.json` - Tracks enrichment progress
- `daily-scrape-log.json` - Daily scraping summary

## API Endpoints

When running the API server (`node src/api/scraper-api-multi-source.js`):

- `POST /api/scrape` - Trigger all sources
- `POST /api/scrape/mercadolibre` - Trigger MercadoLibre only
- `POST /api/scrape/lamudi` - Trigger Lamudi only
- `GET /api/stats` - Get statistics for all sources
- `GET /api/new-listings?hours=24&source=lamudi` - Recent listings
- `GET /api/search?city=guadalajara&minPrice=5000` - Search listings
