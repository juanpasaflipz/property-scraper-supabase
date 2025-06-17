import dotenv from 'dotenv';
dotenv.config();

import axios from 'axios';
import * as cheerio from 'cheerio';

async function testLamudiExtract() {
  console.log('🔍 Testing Lamudi Property Extraction\n');
  
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
    
    // Get listing cards
    const cards = $('.listings__cards > div');
    console.log(`Found ${cards.length} listing cards\n`);
    
    // Analyze first 3 cards
    cards.slice(0, 3).each((i, element) => {
      const $el = $(element);
      console.log(`\n${'='.repeat(50)}\nCard ${i + 1}:\n${'='.repeat(50)}\n`);
      
      // Check for links
      const link = $el.find('a[href]').first();
      if (link.length) {
        const href = link.attr('href');
        console.log(`Link: ${href}`);
        
        // Generate ID from URL
        if (href && href.includes('.html')) {
          const match = href.match(/\/([^\/]+)\.html$/);
          if (match) {
            console.log(`ID: LAMUDI-${match[1]}`);
          }
        }
      }
      
      // Look for image
      const img = $el.find('img').first();
      if (img.length) {
        console.log(`Image: ${img.attr('src') || img.attr('data-src') || 'none'}`);
        console.log(`Alt: ${img.attr('alt') || 'none'}`);
      }
      
      // Extract text content
      const text = $el.text().replace(/\s+/g, ' ').trim();
      console.log(`\nText content: ${text.substring(0, 200)}...`);
      
      // Look for price
      const priceMatch = text.match(/\$[\d,]+(\s*(MXN|USD|pesos))?/);
      if (priceMatch) {
        console.log(`\nPrice: ${priceMatch[0]}`);
      }
      
      // Look for location
      const locationPatterns = [
        /([^,$]+),\s*([^,$]+),\s*Ciudad de México/,
        /([^,$]+),\s*([^,$]+),\s*CDMX/,
        /([^,$]+),\s*([^,$]+)$/
      ];
      
      for (const pattern of locationPatterns) {
        const locationMatch = text.match(pattern);
        if (locationMatch) {
          console.log(`Location: ${locationMatch[0]}`);
          break;
        }
      }
      
      // Look for attributes
      const bedrooms = text.match(/(\d+)\s*(rec|recámaras|habitaciones)/i);
      const bathrooms = text.match(/(\d+)\s*(baño|baños)/i);
      const area = text.match(/(\d+)\s*m[²2]/i);
      
      if (bedrooms) console.log(`Bedrooms: ${bedrooms[1]}`);
      if (bathrooms) console.log(`Bathrooms: ${bathrooms[1]}`);
      if (area) console.log(`Area: ${area[1]} m²`);
      
      // Check structure
      console.log(`\nStructure:`);
      console.log(`- Direct children: ${$el.children().length}`);
      console.log(`- Has link: ${$el.find('a').length > 0}`);
      console.log(`- Has image: ${$el.find('img').length > 0}`);
      console.log(`- Classes: ${$el.attr('class') || 'none'}`);
      
      // Check nested structure
      const nestedDivs = $el.find('div');
      console.log(`- Nested divs: ${nestedDivs.length}`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testLamudiExtract();