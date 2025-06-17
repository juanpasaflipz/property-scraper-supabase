import dotenv from 'dotenv';
dotenv.config();

import { LamudiScraperWithFallback } from './src/scrapers/lamudi-scraper-fallback.js';

async function testLamudiWithToken() {
  console.log('🧪 Testing Lamudi Scraper with Scrape.do Token\n');
  
  // Verify token is loaded
  console.log('✅ Token loaded:', process.env.SCRAPEDO_TOKEN ? 'Yes' : 'No');
  console.log('Token length:', process.env.SCRAPEDO_TOKEN?.length || 0);
  
  const scraper = new LamudiScraperWithFallback();
  
  try {
    // Test with a single page
    console.log('\n🔍 Testing Lamudi scrape for Mexico City rentals...\n');
    
    // Override to test just one listing
    const originalScrapePage = scraper.scrapePage.bind(scraper);
    scraper.scrapePage = async function(url, operationType) {
      console.log('Fetching URL with Scrape.do:', url);
      const listings = await originalScrapePage(url, operationType);
      
      if (listings.length > 0) {
        console.log(`\n✅ Successfully scraped ${listings.length} listings!\n`);
        console.log('📊 First listing details:');
        const first = listings[0];
        console.log(`- Title: ${first.title}`);
        console.log(`- Price: $${parseInt(first.price).toLocaleString()} ${first.currency}`);
        console.log(`- Location: ${first.city}, ${first.state}`);
        console.log(`- Type: ${first.property_type}`);
        console.log(`- Bedrooms: ${first.bedrooms}`);
        console.log(`- Bathrooms: ${first.bathrooms}`);
        console.log(`- Size: ${first.size} m²`);
        console.log(`- Link: ${first.link}`);
        console.log(`- Has image: ${first.image_url ? 'Yes' : 'No'}`);
      }
      
      return listings.slice(0, 3); // Return only 3 for testing
    };
    
    // Override pagination to test just one page
    scraper.scrapeAllPages = async function(baseUrl, type) {
      return await this.scrapePage(baseUrl, type);
    };
    
    // Run the test
    const result = await scraper.scrapeLamudiToSupabase('mexico city', 'rent');
    
    console.log('\n📈 Final Results:');
    console.log(`- Total processed: ${result.total}`);
    console.log(`- Added to database: ${result.added}`);
    console.log(`- Updated in database: ${result.updated}`);
    console.log(`- Errors: ${result.errors}`);
    
    if (result.total > 0) {
      console.log('\n✅ Lamudi scraper is working correctly with your Scrape.do token!');
    } else {
      console.log('\n⚠️  No listings found. This might indicate an issue with the scraper or Lamudi has changed their structure.');
    }
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    
    if (error.response?.status === 400) {
      console.error('\n⚠️  Scrape.do returned 400 error. Possible issues:');
      console.error('1. Token might be invalid or expired');
      console.error('2. URL format might be incorrect');
      console.error('3. Scrape.do might be having issues with Lamudi');
    } else if (error.response?.status === 403) {
      console.error('\n⚠️  Access forbidden. Lamudi might be blocking requests.');
    }
    
    if (error.response?.data) {
      console.error('\nError details:', error.response.data);
    }
  } finally {
    await scraper.close();
  }
}

// Run the test
testLamudiWithToken();