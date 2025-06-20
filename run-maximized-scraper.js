import dotenv from 'dotenv';
dotenv.config();

import { Database } from './src/db/database.js';
import { PropertyRepositoryCSV } from './src/db/property-repository-csv.js';
import { MercadoLibreMaximizedScraper } from './src/scrapers/mercadolibre-maximized.js';

async function runMaximizedScraper() {
  const db = new Database();
  const scraper = new MercadoLibreMaximizedScraper();
  
  console.log('🚀 Starting MercadoLibre Maximized Scraper\n');
  console.log('This will run multiple search combinations to maximize data retrieval.');
  console.log('Expected time: 15-30 minutes for a comprehensive scrape.\n');
  
  try {
    await db.connect();
    console.log('✅ Connected to database\n');
    
    const repository = new PropertyRepositoryCSV(db);
    
    // Get current count
    const beforeCount = await db.query('SELECT COUNT(*) FROM properties WHERE source = \'mercadolibre\'');
    console.log(`📊 Current MercadoLibre properties in database: ${beforeCount.rows[0].count}\n`);
    
    // Progress callback
    const progressCallback = (progress) => {
      console.log(`\n🔄 Progress: ${progress.current}/${progress.total} searches`);
      console.log(`📍 Current search: ${progress.description}`);
      console.log(`📊 Unique listings found so far: ${progress.listingsFound}`);
    };
    
    // Run the maximized scraper
    console.log('🕷️ Starting scraping process...\n');
    const startTime = Date.now();
    
    const listings = await scraper.scrapeWithMaximization({
      maxSearches: 30, // Start with 30 searches, can increase later
      shuffleSearches: true,
      progressCallback
    });
    
    const scrapingTime = ((Date.now() - startTime) / 1000 / 60).toFixed(2);
    console.log(`\n✅ Scraping completed in ${scrapingTime} minutes`);
    console.log(`📊 Total unique listings found: ${listings.length}\n`);
    
    if (listings.length > 0) {
      // Show sample listings
      console.log('📋 Sample listings:');
      listings.slice(0, 3).forEach((listing, i) => {
        console.log(`\n${i + 1}. ${listing.title}`);
        console.log(`   Price: $${parseInt(listing.price).toLocaleString()} ${listing.currency}`);
        console.log(`   Location: ${listing.city}, ${listing.state}`);
        console.log(`   Type: ${listing.property_type}`);
        console.log(`   Bedrooms: ${listing.bedrooms}, Size: ${listing.size}m²`);
        if (listing.search_metadata) {
          console.log(`   Found via: ${listing.search_metadata.description}`);
        }
      });
      
      // Insert into database
      console.log('\n💾 Inserting into database...');
      const results = await repository.upsertProperties(listings);
      
      console.log('\n📊 Database Results:');
      console.log(`✅ Inserted: ${results.inserted} new properties`);
      console.log(`🔄 Updated: ${results.updated} existing properties`);
      console.log(`❌ Errors: ${results.errors.length}`);
      
      if (results.errors.length > 0) {
        console.log('\n⚠️ Sample errors:');
        results.errors.slice(0, 5).forEach(err => {
          console.log(`- ${err.id}: ${err.error}`);
        });
      }
      
      // Final count
      const afterCount = await db.query('SELECT COUNT(*) FROM properties WHERE source = \'mercadolibre\'');
      const totalCount = await db.query('SELECT COUNT(*) FROM properties');
      
      console.log('\n📈 Final Statistics:');
      console.log(`- MercadoLibre properties: ${afterCount.rows[0].count} (+${afterCount.rows[0].count - beforeCount.rows[0].count})`);
      console.log(`- Total properties in database: ${totalCount.rows[0].count}`);
      
      // Save search metadata
      const searchStats = {
        timestamp: new Date().toISOString(),
        searchesRun: 30,
        uniqueListingsFound: listings.length,
        inserted: results.inserted,
        updated: results.updated,
        errors: results.errors.length,
        duration: scrapingTime + ' minutes',
        searchTypes: [...new Set(listings.map(l => l.search_metadata?.description || 'unknown'))].slice(0, 10)
      };
      
      await require('fs/promises').writeFile(
        'maximized-scraper-stats.json',
        JSON.stringify(searchStats, null, 2)
      );
      console.log('\n📄 Stats saved to maximized-scraper-stats.json');
    }
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    if (db.pool) {
      await db.pool.end();
      console.log('\n👋 Database connection closed');
    }
  }
}

// Add command line option for quick test
const args = process.argv.slice(2);
if (args.includes('--test')) {
  console.log('🧪 Running in test mode (only 3 searches)...\n');
  
  // Override the scraper function for testing
  const scraper = new (await import('./src/scrapers/mercadolibre-maximized.js')).MercadoLibreMaximizedScraper();
  
  const testRun = async () => {
    const listings = await scraper.scrapeWithMaximization({
      maxSearches: 3,
      shuffleSearches: false,
      progressCallback: (p) => console.log(`Progress: ${p.current}/${p.total} - ${p.description}`)
    });
    
    console.log(`\n✅ Test completed. Found ${listings.length} unique listings`);
    if (listings.length > 0) {
      console.log('\nSample listing:');
      console.log(listings[0]);
    }
  };
  
  testRun().catch(console.error);
} else {
  runMaximizedScraper();
}