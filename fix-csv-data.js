import dotenv from 'dotenv';
dotenv.config();

import { Database } from './src/db/database.js';
import { PropertyRepositoryCSV } from './src/db/property-repository-csv.js';
import { MercadoLibreScraperImproved } from './src/scrapers/mercadolibre-scraper-improved.js';

async function fixCsvData() {
  const db = new Database();
  const scraper = new MercadoLibreScraperImproved();
  
  try {
    await db.connect();
    const repository = new PropertyRepositoryCSV(db);
    
    console.log('🔧 Fixing CSV data issues...\n');
    
    // First, check current state
    const beforeStats = await db.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN bedrooms > 0 THEN 1 END) as has_bedrooms,
        COUNT(CASE WHEN bathrooms > 0 THEN 1 END) as has_bathrooms,
        COUNT(CASE WHEN CAST(size AS INTEGER) > 0 THEN 1 END) as has_size,
        COUNT(link) as has_link,
        COUNT(image_url) as has_image
      FROM properties
      WHERE source = 'mercadolibre'
    `);
    
    console.log('📊 Before Fix:');
    const before = beforeStats.rows[0];
    console.log(`- Total: ${before.total}`);
    console.log(`- With bedrooms: ${before.has_bedrooms} (${Math.round(before.has_bedrooms/before.total * 100)}%)`);
    console.log(`- With bathrooms: ${before.has_bathrooms} (${Math.round(before.has_bathrooms/before.total * 100)}%)`);
    console.log(`- With size > 0: ${before.has_size} (${Math.round(before.has_size/before.total * 100)}%)`);
    console.log(`- With links: ${before.has_link} (${Math.round(before.has_link/before.total * 100)}%)`);
    console.log(`- With images: ${before.has_image} (${Math.round(before.has_image/before.total * 100)}%)`);
    
    // Scrape fresh data
    console.log('\n🔄 Scraping fresh data with improved scraper...');
    const url = 'https://inmuebles.mercadolibre.com.mx/casas/venta/';
    const listings = await scraper.scrapeMultiplePages(url, 2); // Get 2 pages for more data
    
    console.log(`\n📊 Scraped ${listings.length} listings. Updating database...`);
    
    const updateResults = await repository.upsertProperties(listings);
    
    console.log('\n✅ Update Results:');
    console.log(`- Inserted: ${updateResults.inserted}`);
    console.log(`- Updated: ${updateResults.updated}`);
    console.log(`- Errors: ${updateResults.errors.length}`);
    
    if (updateResults.errors.length > 0) {
      console.log('\n❌ Errors:');
      updateResults.errors.slice(0, 5).forEach(err => {
        console.log(`- ${err.id}: ${err.error}`);
      });
    }
    
    // Check final state
    const afterStats = await db.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN bedrooms > 0 THEN 1 END) as has_bedrooms,
        COUNT(CASE WHEN bathrooms > 0 THEN 1 END) as has_bathrooms,
        COUNT(CASE WHEN CAST(size AS INTEGER) > 0 THEN 1 END) as has_size,
        COUNT(link) as has_link,
        COUNT(image_url) as has_image
      FROM properties
      WHERE source = 'mercadolibre'
    `);
    
    console.log('\n📊 After Fix:');
    const after = afterStats.rows[0];
    console.log(`- Total: ${after.total}`);
    console.log(`- With bedrooms: ${after.has_bedrooms} (${Math.round(after.has_bedrooms/after.total * 100)}%)`);
    console.log(`- With bathrooms: ${after.has_bathrooms} (${Math.round(after.has_bathrooms/after.total * 100)}%)`);
    console.log(`- With size > 0: ${after.has_size} (${Math.round(after.has_size/after.total * 100)}%)`);
    console.log(`- With links: ${after.has_link} (${Math.round(after.has_link/after.total * 100)}%)`);
    console.log(`- With images: ${after.has_image} (${Math.round(after.has_image/after.total * 100)}%)`);
    
    // Show sample of fixed data
    const samples = await db.query(`
      SELECT external_id, title, bedrooms, bathrooms, size, city, state, link
      FROM properties
      WHERE source = 'mercadolibre' 
        AND bedrooms > 0 
        AND link IS NOT NULL
      ORDER BY updated_at DESC
      LIMIT 3
    `);
    
    console.log('\n🏠 Sample Fixed Properties:');
    samples.rows.forEach((prop, i) => {
      console.log(`\n${i + 1}. ${prop.title}`);
      console.log(`   🛏️  ${prop.bedrooms} bed | 🚿 ${prop.bathrooms} bath | 📐 ${prop.size} m²`);
      console.log(`   📍 ${prop.city}, ${prop.state}`);
      console.log(`   🔗 ${prop.link.substring(0, 50)}...`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await db.disconnect();
  }
}

fixCsvData();