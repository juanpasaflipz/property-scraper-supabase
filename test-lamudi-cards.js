import dotenv from 'dotenv';
dotenv.config();

import axios from 'axios';
import * as cheerio from 'cheerio';

async function testLamudiCards() {
  console.log('🔍 Finding Lamudi Property Cards\n');
  
  const scrapeDoUrl = 'https://api.scrape.do';
  const token = process.env.SCRAPEDO_TOKEN;
  const url = 'https://www.lamudi.com.mx/distrito-federal/for-rent/';
  
  try {
    const response = await axios.get(scrapeDoUrl, {
      params: {
        token: token,
        url: url,
        render: 'true',
        geoCode: 'mx'
      },
      timeout: 60000
    });

    const html = response.data;
    const $ = cheerio.load(html);
    
    console.log(`✅ Page fetched successfully\n`);
    
    // Look for listing cards inside the listings container
    const listingsContainer = $('.listings__cards').filter((i, el) => {
      // Find the one that's not navigation
      return !$(el).hasClass('notSponsored');
    });
    
    console.log(`Found ${listingsContainer.length} listings containers\n`);
    
    // Check different card selectors
    const cardSelectors = [
      '.listings__cards > div',
      '.listings__cards > a',
      '.listings__cards article',
      'div[class*="Card"]',
      'a[class*="Card"]',
      '[data-test*="card"]',
      '[data-test*="listing"]'
    ];
    
    let cards = $();
    for (const selector of cardSelectors) {
      cards = $(selector);
      if (cards.length > 0 && cards.length < 100) {
        console.log(`✅ Found ${cards.length} elements with selector: ${selector}\n`);
        break;
      }
    }
    
    // If we didn't find cards, look for links
    if (cards.length === 0) {
      console.log('Looking for property links directly...\n');
      
      // Find all links that look like property URLs
      const propertyLinks = $('a[href]').filter((i, el) => {
        const href = $(el).attr('href') || '';
        // Property URLs typically have this pattern
        return href.match(/\/[a-z-]+\/for-rent\/[a-z0-9-]+\.html$/i) ||
               href.match(/\/[a-z-]+\/for-sale\/[a-z0-9-]+\.html$/i);
      });
      
      console.log(`Found ${propertyLinks.length} property links\n`);
      
      propertyLinks.slice(0, 5).each((i, el) => {
        const $link = $(el);
        const href = $link.attr('href');
        
        console.log(`\n${i + 1}. Property Link: ${href}`);
        
        // Find the parent card
        let $card = $link;
        let depth = 0;
        while (depth < 5) {
          $card = $card.parent();
          if ($card.children().length > 3) {
            break;
          }
          depth++;
        }
        
        // Extract info from the card
        const text = $card.text();
        const price = text.match(/\$[\d,]+(\s*(MXN|USD|pesos))?/);
        const bedrooms = text.match(/(\d+)\s*(rec|recámaras|habitaciones)/i);
        const bathrooms = text.match(/(\d+)\s*(baño|baños)/i);
        const area = text.match(/(\d+)\s*m[²2]/i);
        
        if (price) console.log(`   Price: ${price[0]}`);
        if (bedrooms) console.log(`   Bedrooms: ${bedrooms[1]}`);
        if (bathrooms) console.log(`   Bathrooms: ${bathrooms[1]}`);
        if (area) console.log(`   Area: ${area[1]} m²`);
        
        // Look for title
        const title = $card.find('h2, h3, h4, [class*="title"]').first().text().trim();
        if (title && title.length < 100) console.log(`   Title: ${title}`);
        
        // Look for location
        const location = $card.find('[class*="location"], [class*="address"], [class*="place"]').first().text().trim();
        if (location && location.length < 100) console.log(`   Location: ${location}`);
      });
    }
    
    // Save HTML snippet to file for inspection
    const listingsHtml = $('.listings').html();
    if (listingsHtml) {
      console.log('\n\n📝 Saving listings HTML for inspection...');
      require('fs').writeFileSync('lamudi-listings.html', listingsHtml);
      console.log('Saved to lamudi-listings.html');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testLamudiCards();