import dotenv from 'dotenv';
dotenv.config();

import { Database } from './src/db/database.js';
import { PropertyRepositoryCSV } from './src/db/property-repository-csv.js';
import { MercadoLibreScraperImproved } from './src/scrapers/mercadolibre-scraper-improved.js';

async function runImprovedScraper() {
  const db = new Database();
  const scraper = new MercadoLibreScraperImproved();
  
  try {
    await db.connect();
    console.log('✅ Connected to database\n');
    
    const repository = new PropertyRepositoryCSV(db);
    
    // Scrape data
    console.log('🔄 Scraping MercadoLibre...');
    const url = 'https://inmuebles.mercadolibre.com.mx/departamentos/renta/';
    const listings = await scraper.scrapeListings(url);
    
    console.log(`\n📊 Scraped ${listings.length} listings`);
    
    // Show sample
    if (listings.length > 0) {
      console.log('\n📋 Sample listing:');
      const sample = listings[0];
      console.log(`- External ID: ${sample.external_id}`);
      console.log(`- Title: ${sample.title}`);
      console.log(`- Price: ${sample.price} ${sample.currency}`);
      console.log(`- Location: ${sample.location}`);
      console.log(`- Bedrooms: ${sample.bedrooms}`);
      console.log(`- Size: ${sample.size}`);
    }
    
    // Insert into database
    console.log('\n💾 Inserting into database...');
    const results = await repository.upsertProperties(listings);
    
    console.log('\n✅ Results:');
    console.log(`- Inserted: ${results.inserted}`);
    console.log(`- Updated: ${results.updated}`);
    console.log(`- Errors: ${results.errors.length}`);
    
    if (results.errors.length > 0) {
      console.log('\n❌ Errors:');
      results.errors.slice(0, 5).forEach(err => {
        console.log(`- ${err.id}: ${err.error}`);
      });
    }
    
    // Check total count
    const count = await db.query('SELECT COUNT(*) FROM properties');
    console.log(`\n📈 Total properties in database: ${count.rows[0].count}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    if (db.pool) {
      await db.pool.end();
      console.log('\n👋 Database connection closed');
    }
  }
}

runImprovedScraper();