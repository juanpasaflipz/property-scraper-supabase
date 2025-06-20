import dotenv from 'dotenv';
dotenv.config();

import { Database } from './src/db/database.js';
import { PropertyRepositoryCSV } from './src/db/property-repository-csv.js';
import { MercadoLibreMaximizedScraper } from './src/scrapers/mercadolibre-maximized.js';

async function runQuickMaximized() {
  const db = new Database();
  const scraper = new MercadoLibreMaximizedScraper();
  
  console.log('🚀 Quick Maximized MercadoLibre Scraper\n');
  console.log('This will run many searches with 2 pages each for fast results.\n');
  
  try {
    await db.connect();
    console.log('✅ Connected to database\n');
    
    const repository = new PropertyRepositoryCSV(db);
    
    // Get current count
    const beforeCount = await db.query('SELECT COUNT(*) FROM properties WHERE source = \'mercadolibre\'');
    console.log(`📊 Current MercadoLibre properties: ${beforeCount.rows[0].count}\n`);
    
    // Run the maximized scraper with optimized settings
    console.log('🕷️ Starting fast scraping process...\n');
    const startTime = Date.now();
    
    const listings = await scraper.scrapeWithMaximization({
      maxSearches: 100,     // Run more searches
      shuffleSearches: true,
      progressCallback: (progress) => {
        if (progress.current % 10 === 0 || progress.current === progress.total) {
          console.log(`\n📊 Progress: ${progress.current}/${progress.total} searches (${Math.round(progress.current/progress.total*100)}%)`);
          console.log(`✅ Unique listings found: ${progress.listingsFound}`);
        }
      }
    });
    
    const scrapingTime = ((Date.now() - startTime) / 1000 / 60).toFixed(2);
    console.log(`\n✅ Scraping completed in ${scrapingTime} minutes`);
    console.log(`📊 Total unique listings found: ${listings.length}\n`);
    
    if (listings.length > 0) {
      // Insert into database
      console.log('💾 Inserting into database...');
      const results = await repository.upsertProperties(listings);
      
      console.log('\n📊 Results:');
      console.log(`✅ New properties: ${results.inserted}`);
      console.log(`🔄 Updated: ${results.updated}`);
      console.log(`❌ Errors: ${results.errors.length}`);
      
      // Final count
      const afterCount = await db.query('SELECT COUNT(*) FROM properties WHERE source = \'mercadolibre\'');
      const totalCount = await db.query('SELECT COUNT(*) FROM properties');
      
      console.log('\n📈 Final Database Stats:');
      console.log(`- MercadoLibre properties: ${afterCount.rows[0].count} (+${afterCount.rows[0].count - beforeCount.rows[0].count})`);
      console.log(`- Total properties: ${totalCount.rows[0].count}`);
      
      // Show breakdown by property type
      const typeBreakdown = await db.query(`
        SELECT property_type, COUNT(*) as count 
        FROM properties 
        WHERE source = 'mercadolibre' 
        GROUP BY property_type 
        ORDER BY count DESC
      `);
      
      console.log('\n📊 Properties by type:');
      typeBreakdown.rows.forEach(row => {
        console.log(`- ${row.property_type}: ${row.count}`);
      });
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

// Override scraper to use only 2 pages per search for speed
const originalScrapeUrl = MercadoLibreMaximizedScraper.prototype.scrapeUrl;
MercadoLibreMaximizedScraper.prototype.scrapeUrl = async function(url) {
  return originalScrapeUrl.call(this, url, 2); // Only 2 pages per search
};

runQuickMaximized();