# Property Scraper with Supabase Integration

A robust Node.js application that scrapes property listings from MercadoLibre and integrates with external data sources, storing everything in a Supabase PostgreSQL database.

## Features

- **MercadoLibre Scraper**: Extracts property listings with details like price, location, bedrooms, bathrooms, and area
- **Scrape.do Integration**: Supports loading additional listings from JSON files or API
- **Supabase Database**: Stores all listings in PostgreSQL with proper schema and indexes
- **Deduplication**: Automatically handles duplicate listings based on ID
- **Error Handling**: Comprehensive logging and error tracking
- **Statistics**: Built-in analytics for property data

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

### 4. Run the Scraper

Basic usage:
```bash
npm start
```

With custom parameters:
```bash
# Scrape specific URL with 5 pages
node src/index.js scrape "https://inmuebles.mercadolibre.com.mx/departamentos/renta/" 5

# Get statistics
node src/index.js stats

# Search properties
node src/index.js search 1000000 5000000 3
```

## Database Schema

The `properties` table includes:

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT | Primary key (unique identifier) |
| title | TEXT | Property title/headline |
| price | NUMERIC | Property price |
| address | TEXT | Location/address |
| bedrooms | INTEGER | Number of bedrooms |
| bathrooms | INTEGER | Number of bathrooms |
| area_sqm | NUMERIC | Area in square meters |
| source | TEXT | Data source (e.g., 'mercadolibre', 'scrapedo') |
| url | TEXT | Original listing URL |
| property_type | TEXT | Type of property (Casa, Departamento, etc.) |
| fetched_at | TIMESTAMP | Last fetch timestamp |
| created_at | TIMESTAMP | Record creation time |
| updated_at | TIMESTAMP | Last update time |
| raw_data | JSONB | Original raw data |

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