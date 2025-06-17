# 🤖 Automated Property Scraping with Scrape.do

## Overview

This system uses Scrape.do to automatically scrape MercadoLibre property listings every 24 hours, updating only new listings and changes to existing properties.

## 🚀 Features

### 1. **Automated Daily Scraping**
- Runs every day at 2 AM (configurable)
- Uses Scrape.do for reliable, proxy-based scraping
- Covers multiple states and property types
- Only updates new or changed listings

### 2. **Thorough Search Coverage**
- **Property Types**: Houses (casas) and Apartments (departamentos)
- **Operations**: Sale (venta) and Rent (renta)
- **States**: CDMX, Estado de México, Jalisco, Nuevo León, Querétaro, Puebla, Guanajuato, Yucatán
- **Smart Deduplication**: Prevents duplicate entries

### 3. **RESTful API**
- `/api/scrape` - Trigger manual scrape
- `/api/stats` - Get statistics
- `/api/new-listings` - View recent discoveries
- `/api/search` - Search properties with filters

### 4. **Monitoring & State Management**
- Tracks scraping history
- Maintains state between runs
- Provides detailed statistics
- Logs all operations

## 📦 Installation

1. **Install dependencies:**
```bash
npm install
```

2. **Configure environment variables:**
```bash
# Copy and edit .env file
cp .env.example .env

# Required variables:
SCRAPEDO_TOKEN=your-scrape-do-token
DATABASE_URL=postgresql://...
CRON_SCHEDULE=0 2 * * *  # Daily at 2 AM
```

## 🏃 Running the Service

### Option 1: Scheduler Only (Recommended for Production)
```bash
# Start the scheduler (runs continuously)
npm run scheduler

# Run once immediately
npm run scheduler:run

# Check statistics
npm run scheduler:stats
```

### Option 2: Full API Server
```bash
# Start server with scheduler and API
npm run server

# Development mode with auto-reload
npm run server:dev
```

## 📊 How It Works

### Daily Update Process

1. **Load Previous State**
   - Reads existing property IDs from database
   - Checks last run timestamp

2. **Thorough Search**
   - Searches across all configured states
   - Multiple property types and operations
   - Uses Scrape.do for reliable access

3. **Smart Updates**
   - Identifies new listings (not in database)
   - Updates existing listings (price changes, etc.)
   - Skips unchanged properties

4. **Database Operations**
   - Inserts new properties
   - Updates existing ones
   - Maintains history with timestamps

5. **Reporting**
   - Saves run statistics
   - Logs summary
   - Optional notifications for new listings

## 🔧 Configuration

### Scrape.do Settings
```javascript
{
  render: true,      // Enable JavaScript rendering
  premium: true,     // Use premium proxies
  geoCode: 'mx'      // Use Mexican proxies
}
```

### Search Parameters
Edit in `automated-scraper.js`:
```javascript
const searchParams = {
  propertyTypes: ['casas', 'departamentos'],
  operations: ['venta', 'renta'],
  states: ['distrito-federal', 'estado-de-mexico', ...],
  maxPagesPerSearch: 3
};
```

### Cron Schedule
Default: `0 2 * * *` (2 AM daily)

Common patterns:
- `0 */6 * * *` - Every 6 hours
- `0 8,20 * * *` - 8 AM and 8 PM
- `*/30 * * * *` - Every 30 minutes (testing)

## 📈 Monitoring

### Check Statistics
```bash
npm run scheduler:stats
```

Output:
```
📊 Scraper Statistics:
======================
Total Properties: 15,234
Unique Properties: 15,234
States Covered: 8
Cities Covered: 127
Houses: 9,456
Apartments: 5,778
Average Price: $2,345,678 MXN
New in Last 24h: 234

Last Run: 12/17/2024, 2:00:00 AM
Total Scraped: 45,678
Total New: 15,234
Total Updated: 30,444
```

### View Scraper State
Check `scraper-state.json`:
```json
{
  "lastRun": "2024-12-17T08:00:00.000Z",
  "totalScraped": 45678,
  "totalNew": 15234,
  "totalUpdated": 30444,
  "runs": [...]
}
```

## 🌐 API Usage

### Trigger Manual Scrape
```bash
curl -X POST http://localhost:3000/api/scrape
```

### Get Statistics
```bash
curl http://localhost:3000/api/stats
```

### View New Listings (last 24h)
```bash
curl http://localhost:3000/api/new-listings?hours=24
```

### Search Properties
```bash
curl "http://localhost:3000/api/search?minPrice=1000000&maxPrice=5000000&bedrooms=3&state=Jalisco"
```

## 🚀 Deployment

### Using PM2
```bash
# Install PM2
npm install -g pm2

# Start the service
pm2 start server.js --name property-scraper

# Save PM2 configuration
pm2 save
pm2 startup
```

### Using Docker
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
CMD ["node", "server.js"]
```

### Using Systemd
Create `/etc/systemd/system/property-scraper.service`:
```ini
[Unit]
Description=Property Scraper Service
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/property-scraper
ExecStart=/usr/bin/node /home/ubuntu/property-scraper/server.js
Restart=on-failure
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

## 🔍 Troubleshooting

### Common Issues

1. **Scrape.do Token Invalid**
   - Check SCRAPEDO_TOKEN in .env
   - Verify token at scrape.do dashboard

2. **Database Connection Failed**
   - Check DATABASE_URL
   - Verify Supabase is accessible

3. **No New Listings Found**
   - Check search parameters
   - Verify MercadoLibre HTML structure hasn't changed

4. **High Memory Usage**
   - Reduce maxPagesPerSearch
   - Implement pagination for large datasets

## 📊 Performance

- Average scrape time: 5-10 minutes
- Properties per run: 1,000-5,000
- Scrape.do API calls: ~50-200 per run
- Database operations: Batch upserts

## 🔒 Security

- Store SCRAPEDO_TOKEN securely
- Use read-only database user if possible
- Implement rate limiting on API endpoints
- Monitor for unusual activity

## 📝 License

MIT