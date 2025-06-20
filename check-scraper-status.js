import dotenv from 'dotenv';
dotenv.config();

import { Database } from './src/db/database.js';

async function checkScraperStatus() {
  const db = new Database();
  
  try {
    await db.connect();
    console.log('🏠 Property Scraper Status\n');
    
    // Total properties
    const total = await db.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN source = 'mercadolibre' THEN 1 END) as mercadolibre,
        COUNT(CASE WHEN source = 'lamudi' THEN 1 END) as lamudi
      FROM properties
    `);
    
    console.log('📊 Total Properties:');
    console.log(`- All sources: ${total.rows[0].total}`);
    console.log(`- MercadoLibre: ${total.rows[0].mercadolibre}`);
    console.log(`- Lamudi: ${total.rows[0].lamudi}\n`);
    
    // Recent activity
    const recent = await db.query(`
      SELECT 
        COUNT(CASE WHEN created_at > NOW() - INTERVAL '1 hour' THEN 1 END) as last_hour,
        COUNT(CASE WHEN created_at > NOW() - INTERVAL '24 hours' THEN 1 END) as last_day,
        COUNT(CASE WHEN created_at > NOW() - INTERVAL '7 days' THEN 1 END) as last_week
      FROM properties
      WHERE source = 'mercadolibre'
    `);
    
    console.log('🕐 Recent Activity (MercadoLibre):');
    console.log(`- Last hour: ${recent.rows[0].last_hour} new properties`);
    console.log(`- Last 24h: ${recent.rows[0].last_day} new properties`);
    console.log(`- Last 7 days: ${recent.rows[0].last_week} new properties\n`);
    
    // Detail enrichment status
    const enrichment = await db.query(`
      SELECT 
        COUNT(CASE WHEN detail_scraped = TRUE THEN 1 END) as with_details,
        COUNT(CASE WHEN detail_scraped = FALSE THEN 1 END) as without_details,
        ROUND(AVG(CASE WHEN detail_scraped = TRUE THEN 1 ELSE 0 END) * 100, 1) as percent_enriched
      FROM properties
      WHERE source = 'mercadolibre'
    `);
    
    console.log('💎 Enrichment Status:');
    console.log(`- With details: ${enrichment.rows[0].with_details}`);
    console.log(`- Without details: ${enrichment.rows[0].without_details}`);
    console.log(`- Progress: ${enrichment.rows[0].percent_enriched}%\n`);
    
    // Check scrapers
    console.log('🤖 Scraper Schedule:');
    console.log('- Main scraper: Runs at 6 AM and 6 PM daily');
    console.log('- Detail enrichment: Runs every 2 hours');
    console.log('- Both managed by PM2\n');
    
    // Next runs
    const now = new Date();
    const hour = now.getHours();
    let nextScrape;
    
    if (hour < 6) {
      nextScrape = '6:00 AM today';
    } else if (hour < 18) {
      nextScrape = '6:00 PM today';
    } else {
      nextScrape = '6:00 AM tomorrow';
    }
    
    console.log(`⏰ Next scheduled scrape: ${nextScrape}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    if (db.pool) {
      await db.pool.end();
    }
  }
}

checkScraperStatus();