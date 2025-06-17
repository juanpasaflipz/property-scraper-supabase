import dotenv from 'dotenv';
dotenv.config();

import axios from 'axios';
import * as cheerio from 'cheerio';

async function testLamudiListings() {
  console.log('🔍 Finding Lamudi Listings\n');
  
  const scrapeDoUrl = 'https://api.scrape.do';
  const token = process.env.SCRAPEDO_TOKEN;
  const url = 'https://www.lamudi.com.mx/distrito-federal/for-rent/';
  
  try {
    console.log('Fetching page with Scrape.do...');
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
    
    // Find elements with listing in class
    console.log('🏠 Analyzing elements with "listing" in class:\n');
    $('[class*="listing"]').each((i, el) => {
      const $el = $(el);
      const tag = el.tagName;
      const className = $el.attr('class');
      
      // Skip if it's just a container
      if (className && className.includes('container')) return;
      
      console.log(`\n${i + 1}. ${tag}.${className}`);
      
      // Look for links
      const links = $el.find('a[href*="/for-rent/"], a[href*="/for-sale/"]');
      if (links.length > 0) {
        console.log(`   Links found: ${links.length}`);
        links.slice(0, 2).each((j, link) => {
          console.log(`   - ${$(link).attr('href')}`);
        });
      }
      
      // Look for prices
      const text = $el.text();
      const priceMatch = text.match(/\$[\d,]+/);
      if (priceMatch) {
        console.log(`   Price: ${priceMatch[0]}`);
      }
      
      // Look for property info
      const hasInfo = text.match(/(\d+)\s*(rec|hab|baño|m²|m2)/i);
      if (hasInfo) {
        console.log(`   Info: ${hasInfo[0]}`);
      }
      
      // Check children
      const childCount = $el.children().length;
      console.log(`   Children: ${childCount}`);
      
      if (i >= 5) return false; // Only check first 6
    });
    
    // Look for property cards with different approach
    console.log('\n\n🔍 Looking for property cards with data:\n');
    
    // Find divs that contain both a link and a price
    const potentialListings = [];
    $('div').each((i, el) => {
      const $el = $(el);
      const link = $el.find('a[href*="/for-rent/"], a[href*="/for-sale/"]').first();
      const priceText = $el.text();
      const hasPrice = priceText.match(/\$[\d,]+\s*(MXN|USD)?/);
      
      if (link.length > 0 && hasPrice && link.attr('href') !== url) {
        const href = link.attr('href');
        // Skip if it's a navigation link
        if (href && !href.includes('page=') && !href.includes('?') && href !== '/distrito-federal/for-rent/') {
          potentialListings.push({
            element: $el,
            link: href,
            price: hasPrice[0]
          });
        }
      }
    });
    
    console.log(`Found ${potentialListings.length} potential property listings\n`);
    
    // Analyze first few
    potentialListings.slice(0, 5).forEach((listing, i) => {
      console.log(`\n${i + 1}. Property:`);
      console.log(`   Link: ${listing.link}`);
      console.log(`   Price: ${listing.price}`);
      
      const $el = listing.element;
      
      // Try to find title
      const title = $el.find('h2, h3, h4, [class*="title"]').first().text().trim();
      if (title) console.log(`   Title: ${title}`);
      
      // Try to find location
      const location = $el.find('[class*="location"], [class*="address"]').first().text().trim();
      if (location) console.log(`   Location: ${location}`);
      
      // Try to find attributes
      const text = $el.text();
      const bedrooms = text.match(/(\d+)\s*(rec|recámaras|habitaciones)/i);
      const bathrooms = text.match(/(\d+)\s*(baño|baños)/i);
      const area = text.match(/(\d+)\s*m[²2]/i);
      
      if (bedrooms) console.log(`   Bedrooms: ${bedrooms[1]}`);
      if (bathrooms) console.log(`   Bathrooms: ${bathrooms[1]}`);
      if (area) console.log(`   Area: ${area[1]} m²`);
      
      // Check parent structure
      let parent = $el.parent();
      let depth = 0;
      while (parent.length && depth < 3) {
        const parentClass = parent.attr('class');
        if (parentClass && parentClass.includes('listing')) {
          console.log(`   Parent class: ${parentClass}`);
          break;
        }
        parent = parent.parent();
        depth++;
      }
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testLamudiListings();