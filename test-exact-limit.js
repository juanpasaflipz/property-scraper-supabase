import { MercadoLibreScraperImproved } from './src/scrapers/mercadolibre-scraper-improved.js';

async function findExactLimit() {
  const scraper = new MercadoLibreScraperImproved();
  
  console.log('🔍 Finding exact pagination limit on MercadoLibre\n');
  
  try {
    const baseUrl = 'https://inmuebles.mercadolibre.com.mx/';
    
    // Binary search to find the exact limit
    let low = 20;  // We know page 20 works
    let high = 50; // We know page 50 doesn't work
    let lastWorkingPage = 20;
    
    console.log('Using binary search to find exact limit...\n');
    
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const offset = (mid - 1) * 48;
      const url = `${baseUrl}_Desde_${offset + 1}`;
      
      console.log(`Testing page ${mid}...`);
      
      try {
        const listings = await scraper.scrapeListings(url);
        
        if (listings.length > 0) {
          console.log(`✅ Page ${mid}: ${listings.length} listings found`);
          lastWorkingPage = mid;
          low = mid + 1;
        } else {
          console.log(`❌ Page ${mid}: No listings`);
          high = mid - 1;
        }
      } catch (error) {
        console.log(`❌ Page ${mid}: Error - ${error.message}`);
        high = mid - 1;
      }
      
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    console.log(`\n📊 Results:`);
    console.log(`Last working page: ${lastWorkingPage}`);
    console.log(`Maximum offset: ${(lastWorkingPage - 1) * 48}`);
    console.log(`Maximum accessible listings: ${lastWorkingPage * 48}`);
    
    // Test with different search parameters
    console.log('\n🔍 Testing with specific search parameters...\n');
    
    const searches = [
      { url: 'https://inmuebles.mercadolibre.com.mx/casas/venta/', name: 'Casas en venta' },
      { url: 'https://inmuebles.mercadolibre.com.mx/departamentos/renta/', name: 'Departamentos en renta' },
      { url: 'https://inmuebles.mercadolibre.com.mx/terrenos/', name: 'Terrenos' },
    ];
    
    for (const search of searches) {
      console.log(`\nTesting: ${search.name}`);
      
      // Test page 1
      const page1Listings = await scraper.scrapeListings(search.url);
      console.log(`Page 1: ${page1Listings.length} listings`);
      
      // Test page 42 (around limit)
      const offset = 41 * 48;
      const page42Url = `${search.url}${search.url.includes('?') ? '&' : '?'}_Desde_${offset + 1}`;
      const page42Listings = await scraper.scrapeListings(page42Url);
      console.log(`Page 42: ${page42Listings.length} listings`);
      
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

findExactLimit();