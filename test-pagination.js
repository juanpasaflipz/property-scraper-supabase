import { MercadoLibreScraperImproved } from './src/scrapers/mercadolibre-scraper-improved.js';

async function testPagination() {
  const scraper = new MercadoLibreScraperImproved();
  
  console.log('🔍 Testing MercadoLibre Pagination\n');
  
  try {
    const baseUrl = 'https://inmuebles.mercadolibre.com.mx/';
    
    // Test different pages to see how many listings we get
    const pageTests = [1, 10, 20, 50, 100];
    const results = [];
    
    for (const pageNum of pageTests) {
      const offset = (pageNum - 1) * 48;
      const url = `${baseUrl}_Desde_${offset + 1}`;
      
      console.log(`\n📄 Testing page ${pageNum} (offset: ${offset})...`);
      console.log(`URL: ${url}`);
      
      try {
        const listings = await scraper.scrapeListings(url);
        console.log(`✅ Found ${listings.length} listings`);
        
        if (listings.length > 0) {
          console.log(`Sample: ${listings[0].title.substring(0, 50)}...`);
        }
        
        results.push({
          page: pageNum,
          count: listings.length,
          hasListings: listings.length > 0
        });
      } catch (error) {
        console.log(`❌ Error on page ${pageNum}: ${error.message}`);
        results.push({
          page: pageNum,
          count: 0,
          hasListings: false,
          error: error.message
        });
      }
      
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log('\n📊 Summary:');
    console.log('Page\tListings\tStatus');
    console.log('----\t--------\t------');
    results.forEach(r => {
      console.log(`${r.page}\t${r.count}\t\t${r.hasListings ? '✅' : '❌'} ${r.error || ''}`);
    });
    
    // Calculate theoretical maximum
    const maxWorkingPage = results.filter(r => r.hasListings).pop();
    if (maxWorkingPage) {
      const theoreticalMax = maxWorkingPage.page * 48;
      console.log(`\n💡 Maximum accessible listings: ~${theoreticalMax} (page ${maxWorkingPage.page})`);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testPagination();