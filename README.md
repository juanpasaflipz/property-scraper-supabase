# Property Scraper with Supabase Integration

A robust Node.js application that scrapes property listings from multiple Mexican real estate portals (MercadoLibre and Lamudi) and integrates with external data sources, storing everything in a Supabase PostgreSQL database.

## Features

- **Multi-Source Scraping**: 
  - MercadoLibre: Mexico's largest real estate portal
  - Lamudi: International property platform with Mexican listings
- **Scrape.do Integration**: Bypasses anti-bot protection for reliable data extraction
- **Supabase Database**: Stores all listings in PostgreSQL with proper schema and indexes
- **Automated Scheduling**: 24-hour automated scraping with configurable schedule
- **Deduplication**: Automatically handles duplicate listings based on ID
- **RESTful API**: Manual triggers and real-time statistics
- **Error Handling**: Comprehensive logging and fallback mechanisms
- **Statistics**: Built-in analytics for property data by source

## Setup Instructions

### 1. Clone and Install Dependencies

```bash
cd property-scraper
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env` and update with your credentials:

```bash
cp .env.example .env
```

Edit `.env` with your Supabase credentials:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Database Connection (Direct Postgres)
DATABASE_URL=postgresql://postgres:password@db.your-project.supabase.co:5432/postgres

# Optional: Scrape.do API
SCRAPEDO_TOKEN=your-token
```

### 3. Run Database Migration

Create the properties table and indexes:

```bash
npm run migrate
```

### 4. Run the Scrapers

#### Manual Scraping

**MercadoLibre:**
```bash
# Basic usage
npm start

# Scrape specific URL with 5 pages
node src/index.js scrape "https://inmuebles.mercadolibre.com.mx/departamentos/renta/" 5

# Get statistics
node src/index.js stats

# Search properties
node src/index.js search 1000000 5000000 3
```

**Lamudi:**
```bash
# Scrape Lamudi México
node src/scrapers/lamudi-scraper.js "mexico city" "rent"
node src/scrapers/lamudi-scraper.js "guadalajara" "sale"
node src/scrapers/lamudi-scraper.js "monterrey" "rent"
```

#### Automated Multi-Source Scraping

The system includes a 24-hour automated scraper that runs both MercadoLibre and Lamudi:

```bash
# Run all sources once
node src/scheduler-multi-source.js run

# Start continuous 24-hour scheduler
node src/scheduler-multi-source.js start

# View statistics for all sources
node src/scheduler-multi-source.js stats

# Configure schedule (default: 2 AM daily)
CRON_SCHEDULE="0 */6 * * *" node src/scheduler-multi-source.js start  # Every 6 hours
```

#### API Server

Start the RESTful API for manual triggers and monitoring:

```bash
# Start API server on port 3001
node src/api/scraper-api-multi-source.js

# Or with custom port
PORT=8080 node src/api/scraper-api-multi-source.js
```

API Endpoints:
- `POST /api/scrape` - Trigger all sources
- `POST /api/scrape/mercadolibre` - Trigger MercadoLibre only
- `POST /api/scrape/lamudi` - Trigger Lamudi only
- `GET /api/stats` - Get statistics for all sources
- `GET /api/new-listings?hours=24&source=lamudi` - Recent listings
- `GET /api/search?city=guadalajara&minPrice=5000` - Search listings

## Database Schema

The `properties` table includes:

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL | Auto-incrementing primary key |
| external_id | TEXT | Unique identifier from source |
| title | TEXT | Property title/headline |
| price | TEXT | Property price (stored as string) |
| currency | TEXT | Currency (MXN or USD) |
| location | TEXT | Full address/location |
| city | TEXT | City name |
| state | TEXT | State/province name |
| country | TEXT | Country (default: Mexico) |
| bedrooms | INTEGER | Number of bedrooms |
| bathrooms | INTEGER | Number of bathrooms |
| size | TEXT | Property size (m²) |
| property_type | TEXT | Type (Casa, Departamento, etc.) |
| link | TEXT | Original listing URL |
| description | TEXT | Property description |
| image_url | TEXT | Main property image |
| source | TEXT | Data source ('mercadolibre', 'lamudi') |
| created_at | TIMESTAMP | Record creation time |
| updated_at | TIMESTAMP | Last update time |
| last_seen_at | TIMESTAMP | Last time listing was active |

## API Usage

### Programmatic Usage

```javascript
import { PropertyScraperApp } from './src/index.js';

const app = new PropertyScraperApp();
await app.initialize();

// Scrape and store
const results = await app.scrapeAndStore({
  mercadolibreUrl: 'https://inmuebles.mercadolibre.com.mx/casas/venta/',
  maxPages: 3,
  includeScrapeDo: true,
  scrapeDoFile: './listings.json'
});

// Get statistics
const stats = await app.getStatistics();

// Search properties
const properties = await app.repository.searchProperties({
  minPrice: 1000000,
  maxPrice: 5000000,
  bedrooms: 3,
  propertyType: 'Casa'
});

await app.close();
```

### Scrape.do Integration

Place your JSON file at `./listings.json` with the following format:

```json
[
  {
    "id": "unique-id",
    "title": "Beautiful House",
    "price": 2500000,
    "address": "Mexico City",
    "bedrooms": 3,
    "bathrooms": 2,
    "area_sqm": 150,
    "url": "https://example.com/listing"
  }
]
```

## Output Format

The scraper returns a summary in JSON format:

```json
{
  "total_processed": 150,
  "inserted": 120,
  "updated": 30,
  "errors": 0,
  "error_details": [],
  "sources": {
    "mercadolibre": 100,
    "scrapedo": 50
  }
}
```

## Error Handling

- All errors are logged with context
- Failed listings don't stop the entire process
- Error details are included in the summary output

## Performance Considerations

- Respects rate limits with 1-second delays between pages
- Uses database connection pooling
- Implements batch upserts for efficiency
- Indexes on commonly queried fields

## License

MIT