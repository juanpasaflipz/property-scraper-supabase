import dotenv from 'dotenv';
dotenv.config();

import { Database } from './src/db/database.js';
import { MercadoLibreDetailScraper } from './src/scrapers/mercadolibre-detail-scraper.js';
import { DetailScrapingQueue } from './src/services/detail-scraping-queue.js';

async function testDetailScraper() {
  console.log('🧪 Testing Property Detail Scraper\n');
  
  const db = new Database();
  const detailScraper = new MercadoLibreDetailScraper();
  
  try {
    await db.connect();
    
    // Step 1: Get a sample property URL from database
    console.log('1️⃣ Getting sample property from database...');
    const sampleProperty = await db.query(`
      SELECT external_id, title, link 
      FROM properties 
      WHERE source = 'mercadolibre' 
      AND link IS NOT NULL
      AND detail_scraped = FALSE
      LIMIT 1
    `);
    
    if (sampleProperty.rows.length === 0) {
      console.log('No properties found to test. Getting any property with link...');
      const anyProperty = await db.query(`
        SELECT external_id, title, link 
        FROM properties 
        WHERE source = 'mercadolibre' 
        AND link IS NOT NULL
        LIMIT 1
      `);
      
      if (anyProperty.rows.length === 0) {
        console.log('❌ No properties with links found in database');
        return;
      }
      
      sampleProperty.rows = anyProperty.rows;
    }
    
    const property = sampleProperty.rows[0];
    console.log(`\n📦 Testing with property:`);
    console.log(`- ID: ${property.external_id}`);
    console.log(`- Title: ${property.title.substring(0, 60)}...`);
    console.log(`- URL: ${property.link}\n`);
    
    // Step 2: Scrape details
    console.log('2️⃣ Scraping property details...');
    const startTime = Date.now();
    
    const details = await detailScraper.scrapePropertyDetails(property.link);
    
    const scrapingTime = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ Scraping completed in ${scrapingTime} seconds\n`);
    
    // Step 3: Display results
    console.log('3️⃣ Property Details Found:');
    console.log('='.repeat(50));
    
    console.log('\n📋 Basic Information:');
    console.log(`- Title: ${details.title || 'Not found'}`);
    console.log(`- Price: ${details.price?.formatted || details.price?.amount || 'Not found'}`);
    console.log(`- Description: ${details.description ? details.description.substring(0, 100) + '...' : 'Not found'}`);
    
    console.log('\n📍 Location:');
    console.log(`- Full Address: ${details.fullAddress || 'Not found'}`);
    console.log(`- Neighborhood: ${details.neighborhood || 'Not found'}`);
    
    console.log('\n🏠 Property Specifications:');
    console.log(`- Total Area: ${details.totalArea || 'Not found'} m²`);
    console.log(`- Built Area: ${details.builtArea || 'Not found'} m²`);
    console.log(`- Bedrooms: ${details.bedrooms || 'Not found'}`);
    console.log(`- Bathrooms: ${details.bathrooms || 'Not found'}`);
    console.log(`- Parking Spaces: ${details.parkingSpaces || 'Not found'}`);
    console.log(`- Property Age: ${details.propertyAge || 'Not found'} years`);
    
    console.log('\n✨ Amenities:');
    if (details.amenities && details.amenities.length > 0) {
      details.amenities.slice(0, 10).forEach(amenity => {
        console.log(`- ${amenity}`);
      });
      if (details.amenities.length > 10) {
        console.log(`... and ${details.amenities.length - 10} more`);
      }
    } else {
      console.log('- No amenities found');
    }
    
    console.log('\n📸 Images:');
    console.log(`- Total images: ${details.images?.length || 0}`);
    if (details.images && details.images.length > 0) {
      console.log(`- First image: ${details.images[0].url.substring(0, 80)}...`);
    }
    console.log(`- Floor plan: ${details.floorPlan ? 'Yes' : 'No'}`);
    
    console.log('\n📊 Additional Info:');
    console.log(`- Seller Type: ${details.sellerType || 'Not found'}`);
    console.log(`- Views: ${details.views || 'Not found'}`);
    console.log(`- Published: ${details.publishDate || 'Not found'}`);
    
    // Step 4: Test batch processing
    console.log('\n\n4️⃣ Testing Batch Detail Scraping...');
    const queue = new DetailScrapingQueue();
    
    console.log('Processing a small batch of properties...');
    const batchResults = await queue.processQueue({ 
      limit: 3,
      onlyNew: false 
    });
    
    console.log(`\n📊 Batch Results:`);
    console.log(`- Processed: ${batchResults.processed}`);
    console.log(`- Success: ${batchResults.success}`);
    console.log(`- Errors: ${batchResults.errors}`);
    
    // Step 5: Show statistics
    const stats = await queue.getDetailedPropertyStats();
    console.log('\n\n5️⃣ Database Statistics:');
    console.log(`- Total properties: ${stats.total_properties}`);
    console.log(`- With details: ${stats.with_details} (${Math.round(stats.with_details / stats.total_properties * 100)}%)`);
    console.log(`- Without details: ${stats.without_details}`);
    console.log(`- With images: ${stats.with_images}`);
    console.log(`- Average views: ${Math.round(stats.avg_views || 0)}`);
    
    // Get top amenities
    const topAmenities = await queue.getTopAmenities(10);
    if (topAmenities.length > 0) {
      console.log('\n🏆 Top Amenities:');
      topAmenities.forEach((item, i) => {
        console.log(`${i + 1}. ${item.amenity} (${item.count} properties)`);
      });
    }
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
  } finally {
    if (db.pool) {
      await db.pool.end();
      console.log('\n\n👋 Test completed');
    }
  }
}

// Run the test
testDetailScraper();