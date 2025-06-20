import dotenv from 'dotenv';
dotenv.config();

import { Database } from './src/db/database.js';
import { PropertyRepositoryCSV } from './src/db/property-repository-csv.js';
import { MercadoLibreMaximizedScraper } from './src/scrapers/mercadolibre-maximized.js';

async function runIncrementalScraper() {
  const db = new Database();
  const scraper = new MercadoLibreMaximizedScraper();
  
  console.log('🚀 Incremental MercadoLibre Scraper\n');
  console.log('This saves data after each search to prevent data loss.\n');
  
  try {
    await db.connect();
    console.log('✅ Connected to database\n');
    
    const repository = new PropertyRepositoryCSV(db);
    
    // Get starting count
    const beforeCount = await db.query('SELECT COUNT(*) FROM properties WHERE source = \'mercadolibre\'');
    const startCount = parseInt(beforeCount.rows[0].count);
    console.log(`📊 Starting count: ${startCount} MercadoLibre properties\n`);
    
    // Generate search URLs
    const searches = scraper.generateSearchUrls();
    
    // Shuffle for variety
    for (let i = searches.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [searches[i], searches[j]] = [searches[j], searches[i]];
    }
    
    // Process searches one by one with incremental saves
    const maxSearches = 50; // Limit for this run
    const searchesToRun = searches.slice(0, maxSearches);
    let totalFound = 0;
    let totalInserted = 0;
    let totalUpdated = 0;
    const seenIds = new Set();
    
    console.log(`🔍 Running ${searchesToRun.length} searches...\n`);
    
    for (let i = 0; i < searchesToRun.length; i++) {
      const search = searchesToRun[i];
      
      try {
        console.log(`\n📍 Search ${i + 1}/${searchesToRun.length}: ${search.params.description}`);
        
        // Scrape with 2 pages per search for speed
        const listings = await scraper.scrapeUrl(search.url, 2);
        
        // Filter out duplicates within this session
        const uniqueListings = listings.filter(listing => {
          if (seenIds.has(listing.external_id)) {
            return false;
          }
          seenIds.add(listing.external_id);
          return true;
        });
        
        if (uniqueListings.length > 0) {
          // Add search metadata
          uniqueListings.forEach(listing => {
            listing.search_metadata = search.params;
          });
          
          // Save immediately
          const result = await repository.upsertProperties(uniqueListings);
          
          totalFound += uniqueListings.length;
          totalInserted += result.inserted;
          totalUpdated += result.updated;
          
          console.log(`✅ Found: ${uniqueListings.length} | Saved: ${result.inserted} new, ${result.updated} updated`);
          console.log(`📊 Session totals - Found: ${totalFound} | New: ${totalInserted} | Updated: ${totalUpdated}`);
        } else {
          console.log(`⚠️  No unique listings found`);
        }
        
        // Small delay between searches
        if (i < searchesToRun.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
        
      } catch (error) {
        console.error(`❌ Error in search: ${error.message}`);
      }
    }
    
    // Final summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 FINAL SUMMARY');
    console.log('='.repeat(60));
    
    const afterCount = await db.query('SELECT COUNT(*) FROM properties WHERE source = \'mercadolibre\'');
    const endCount = parseInt(afterCount.rows[0].count);
    
    console.log(`\n✅ Scraping completed!`);
    console.log(`📊 Total unique listings found: ${totalFound}`);
    console.log(`💾 New properties inserted: ${totalInserted}`);
    console.log(`🔄 Existing properties updated: ${totalUpdated}`);
    console.log(`📈 Database growth: ${startCount} → ${endCount} (+${endCount - startCount})`);
    
    // Show breakdown by property type
    const breakdown = await db.query(`
      SELECT property_type, COUNT(*) as count 
      FROM properties 
      WHERE source = 'mercadolibre' 
      GROUP BY property_type 
      ORDER BY count DESC
    `);
    
    console.log('\n📊 Properties by type:');
    breakdown.rows.forEach(row => {
      console.log(`   ${row.property_type}: ${row.count}`);
    });
    
    // Show recent listings
    const recent = await db.query(`
      SELECT title, price, city, property_type 
      FROM properties 
      WHERE source = 'mercadolibre' 
      ORDER BY created_at DESC 
      LIMIT 5
    `);
    
    console.log('\n🆕 Most recent listings:');
    recent.rows.forEach((row, i) => {
      console.log(`${i + 1}. ${row.title.substring(0, 50)}... - $${parseInt(row.price).toLocaleString()} - ${row.city}`);
    });
    
  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    console.error(error.stack);
  } finally {
    if (db.pool) {
      await db.pool.end();
      console.log('\n👋 Database connection closed');
    }
  }
}

runIncrementalScraper();