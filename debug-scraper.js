import axios from 'axios';
import * as cheerio from 'cheerio';

async function debugScraper() {
  const url = 'https://inmuebles.mercadolibre.com.mx/casas/';
  console.log(`\n🔍 Debugging URL: ${url}\n`);
  
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept-Language': 'es-MX,es;q=0.9,en;q=0.8',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
      },
      timeout: 30000
    });

    const $ = cheerio.load(response.data);
    
    console.log('Response status:', response.status);
    console.log('Final URL:', response.request.res.responseUrl || url);
    
    // Check for listings
    const listings = $('.ui-search-layout__item');
    console.log(`\nFound ${listings.length} listings with .ui-search-layout__item\n`);
    
    if (listings.length > 0) {
      // Analyze first listing structure
      const firstListing = listings.first();
      console.log('First listing HTML structure:');
      console.log(firstListing.html().substring(0, 500) + '...\n');
      
      // Try to extract data
      const link = firstListing.find('a.ui-search-result__link').attr('href') || 
                   firstListing.find('a.ui-search-link').attr('href') || 
                   firstListing.find('a').first().attr('href');
      console.log('Link found:', link);
      
      const title = firstListing.find('h2.ui-search-item__title').text().trim() || 
                    firstListing.find('.ui-search-item__title').text().trim();
      console.log('Title found:', title);
      
      const price = firstListing.find('.andes-money-amount__fraction').first().text().trim();
      console.log('Price found:', price);
    } else {
      // Look for other possible selectors
      console.log('Checking alternative selectors...');
      
      const alternatives = [
        '.ui-search-results',
        '.ui-search-result',
        '[class*="search-result"]',
        '.results-item',
        'article',
        '[data-id]'
      ];
      
      alternatives.forEach(selector => {
        const elements = $(selector);
        if (elements.length > 0) {
          console.log(`Found ${elements.length} elements with selector: ${selector}`);
        }
      });
      
      // Check if we're being blocked
      const pageTitle = $('title').text();
      console.log('\nPage title:', pageTitle);
      
      if (pageTitle.includes('captcha') || pageTitle.includes('robot')) {
        console.log('⚠️  Possible CAPTCHA or bot detection!');
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response headers:', error.response.headers);
    }
  }
}

debugScraper();