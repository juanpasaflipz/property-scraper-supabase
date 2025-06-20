import axios from 'axios';
import * as cheerio from 'cheerio';

async function testUrlStructure() {
  console.log('🔍 Testing MercadoLibre URL structures...\n');
  
  const testUrls = [
    // Basic URLs we know work
    'https://inmuebles.mercadolibre.com.mx/',
    'https://inmuebles.mercadolibre.com.mx/casas/',
    'https://inmuebles.mercadolibre.com.mx/casas/venta/',
    'https://inmuebles.mercadolibre.com.mx/departamentos/renta/',
    
    // Location-based URLs
    'https://inmuebles.mercadolibre.com.mx/casas/venta/distrito-federal/',
    'https://listado.mercadolibre.com.mx/inmuebles/casas/venta/distrito-federal/',
    'https://inmuebles.mercadolibre.com.mx/casas/distrito-federal/',
    'https://inmuebles.mercadolibre.com.mx/_Desde_1_CiudadDistrito-federal',
    
    // Price range URLs
    'https://inmuebles.mercadolibre.com.mx/casas/_PriceRange_0-1000000',
    'https://inmuebles.mercadolibre.com.mx/casas/venta/_PriceRange_1000000-2000000',
    
    // State-based URLs  
    'https://inmuebles.mercadolibre.com.mx/casas/estado-de-mexico/',
    'https://inmuebles.mercadolibre.com.mx/estado-de-mexico/casas/',
    'https://listado.mercadolibre.com.mx/inmuebles/casas/estado-de-mexico/'
  ];
  
  for (const url of testUrls) {
    try {
      console.log(`\nTesting: ${url}`);
      
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 10000,
        maxRedirects: 5
      });
      
      const finalUrl = response.request.res.responseUrl || url;
      const $ = cheerio.load(response.data);
      
      // Count listings
      const listings = $('.ui-search-layout__item').length;
      
      // Get breadcrumb to understand the search
      const breadcrumb = $('.ui-search-breadcrumb__item').map((i, el) => $(el).text().trim()).get().join(' > ');
      
      // Get results count
      const resultsText = $('.ui-search-search-result__quantity-results').text().trim();
      
      console.log(`✅ Success!`);
      console.log(`   Final URL: ${finalUrl}`);
      console.log(`   Listings found: ${listings}`);
      console.log(`   Results text: ${resultsText}`);
      console.log(`   Breadcrumb: ${breadcrumb}`);
      
      if (finalUrl !== url) {
        console.log(`   ⚠️  Redirected from: ${url}`);
      }
      
    } catch (error) {
      console.log(`❌ Failed: ${error.message}`);
    }
    
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

testUrlStructure();