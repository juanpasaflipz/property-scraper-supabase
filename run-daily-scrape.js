import dotenv from 'dotenv';
import fs from 'fs/promises';
dotenv.config();

import { Database } from './src/db/database.js';
import { PropertyRepositoryCSV } from './src/db/property-repository-csv.js';
import { MercadoLibreMaximizedScraper } from './src/scrapers/mercadolibre-maximized.js';
import { Logger } from './src/utils/logger.js';

const logger = new Logger('DailyScrape');

async function runDailyScrape() {
  const db = new Database();
  const scraper = new MercadoLibreMaximizedScraper();
  
  console.log('🚀 Daily Property Scraping\n');
  console.log(`📅 ${new Date().toLocaleString()}\n`);
  
  try {
    await db.connect();
    logger.info('Connected to database');
    
    const repository = new PropertyRepositoryCSV(db);
    
    // Get current count
    const beforeCount = await db.query('SELECT COUNT(*) FROM properties WHERE source = \'mercadolibre\'');
    const startCount = parseInt(beforeCount.rows[0].count);
    console.log(`📊 Current properties: ${startCount}\n`);
    
    // Generate search URLs
    const searches = scraper.generateSearchUrls();
    
    // Shuffle for variety
    for (let i = searches.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [searches[i], searches[j]] = [searches[j], searches[i]];
    }
    
    // Process searches with conservative limits
    const maxSearches = 100; // Run 100 different searches
    const pagesPerSearch = 3; // Get 3 pages per search
    const searchesToRun = searches.slice(0, maxSearches);
    
    let totalFound = 0;
    let totalNew = 0;
    let totalUpdated = 0;
    const seenIds = new Set();
    const allListings = [];
    
    console.log(`🔍 Running ${searchesToRun.length} searches...\n`);
    
    for (let i = 0; i < searchesToRun.length; i++) {
      const search = searchesToRun[i];
      
      try {
        process.stdout.write(`\r⏳ Progress: ${i + 1}/${searchesToRun.length} searches (${Math.round((i + 1) / searchesToRun.length * 100)}%)`);
        
        // Scrape with limited pages
        const listings = await scraper.scrapeUrl(search.url, pagesPerSearch);
        
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
          
          allListings.push(...uniqueListings);
          totalFound += uniqueListings.length;
        }
        
        // Small delay between searches
        if (i < searchesToRun.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
      } catch (error) {
        // Continue on error
        logger.error(`Failed search: ${search.params.description}`, error);
      }
    }
    
    console.log(`\n\n✅ Scraping completed! Found ${totalFound} unique listings\n`);
    
    // Save all at once
    if (allListings.length > 0) {
      console.log('💾 Saving to database...');
      const results = await repository.upsertProperties(allListings);
      
      totalNew = results.inserted;
      totalUpdated = results.updated;
      
      console.log(`\n📊 Database Results:`);
      console.log(`- New properties: ${totalNew}`);
      console.log(`- Updated properties: ${totalUpdated}`);
      console.log(`- Errors: ${results.errors.length}`);
    }
    
    // Final count
    const afterCount = await db.query('SELECT COUNT(*) FROM properties WHERE source = \'mercadolibre\'');
    const endCount = parseInt(afterCount.rows[0].count);
    
    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 DAILY SCRAPE SUMMARY');
    console.log('='.repeat(60));
    console.log(`\n📅 Date: ${new Date().toLocaleDateString()}`);
    console.log(`⏱️  Duration: ${Math.round((Date.now() - startTime) / 1000 / 60)} minutes`);
    console.log(`🔍 Searches run: ${searchesToRun.length}`);
    console.log(`📦 Total found: ${totalFound}`);
    console.log(`✨ New properties: ${totalNew}`);
    console.log(`🔄 Updated: ${totalUpdated}`);
    console.log(`📈 Database growth: ${startCount} → ${endCount} (+${endCount - startCount})`);
    
    // Save state
    const state = {
      timestamp: new Date().toISOString(),
      propertiesBefore: startCount,
      propertiesAfter: endCount,
      newProperties: totalNew,
      updatedProperties: totalUpdated,
      totalFound: totalFound,
      searchesRun: searchesToRun.length
    };
    
    await fs.writeFile(
      'daily-scrape-log.json',
      JSON.stringify(state, null, 2)
    );
    
  } catch (error) {
    logger.error('Daily scrape failed', error);
    console.error('\n❌ Error:', error.message);
  } finally {
    if (db.pool) {
      await db.pool.end();
      console.log('\n👋 Database connection closed');
    }
  }
}

const startTime = Date.now();
runDailyScrape();