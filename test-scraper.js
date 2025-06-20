import { MercadoLibreScraperImproved } from './src/scrapers/mercadolibre-scraper-improved.js';

async function testScraper() {
  const scraper = new MercadoLibreScraperImproved();
  
  console.log('🔍 Testing MercadoLibre Scraper...\n');
  
  try {
    const url = 'https://inmuebles.mercadolibre.com.mx/casas/venta/';
    console.log(`📋 Scraping URL: ${url}`);
    console.log('⏳ This may take a moment...\n');
    
    const listings = await scraper.scrapeListings(url);
    
    console.log(`✅ Successfully scraped ${listings.length} listings\n`);
    
    // Show first 3 listings as examples
    console.log('📊 Sample listings:');
    listings.slice(0, 3).forEach((listing, index) => {
      console.log(`\n--- Listing ${index + 1} ---`);
      console.log(`Title: ${listing.title}`);
      console.log(`Price: ${listing.price} ${listing.currency}`);
      console.log(`Location: ${listing.location}`);
      console.log(`City: ${listing.city}`);
      console.log(`State: ${listing.state}`);
      console.log(`Bedrooms: ${listing.bedrooms}`);
      console.log(`Bathrooms: ${listing.bathrooms}`);
      console.log(`Size: ${listing.size}`);
      console.log(`Link: ${listing.link}`);
      console.log(`Has Image: ${listing.image_url ? 'Yes' : 'No'}`);
    });
    
    // Save to JSON file
    const fs = await import('fs/promises');
    const filename = `scraped-data-${new Date().toISOString().split('T')[0]}.json`;
    await fs.writeFile(filename, JSON.stringify(listings, null, 2));
    console.log(`\n💾 Data saved to ${filename}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  }
}

testScraper();