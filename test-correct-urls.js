import axios from 'axios';
import * as cheerio from 'cheerio';

async function testCorrectUrls() {
  console.log('🔍 Testing correct URL patterns...\n');
  
  const testUrls = [
    'https://inmuebles.mercadolibre.com.mx/casas/',
    'https://inmuebles.mercadolibre.com.mx/departamentos/',
    'https://inmuebles.mercadolibre.com.mx/casas/venta/',
    'https://inmuebles.mercadolibre.com.mx/departamentos/renta/',
    'https://inmuebles.mercadolibre.com.mx/casas/distrito-federal/',
    'https://inmuebles.mercadolibre.com.mx/casas/venta/distrito-federal/',
    'https://inmuebles.mercadolibre.com.mx/casas/_PriceRange_0-1000000',
    'https://inmuebles.mercadolibre.com.mx/casas/venta/_PriceRange_1000000-2000000'
  ];
  
  for (const url of testUrls) {
    try {
      console.log(`Testing: ${url}`);
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 10000
      });
      
      const $ = cheerio.load(response.data);
      const listings = $('.ui-search-layout__item').length;
      const resultsText = $('.ui-search-search-result__quantity-results').text().trim();
      
      console.log(`✅ Success: ${listings} listings, ${resultsText}\n`);
    } catch (error) {
      console.log(`❌ Failed: ${error.message}\n`);
    }
  }
}

testCorrectUrls();