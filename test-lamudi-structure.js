import dotenv from 'dotenv';
dotenv.config();

import axios from 'axios';
import * as cheerio from 'cheerio';

async function testLamudiStructure() {
  console.log('🔍 Analyzing Lamudi HTML Structure\n');
  
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
    
    console.log(`\n✅ Page fetched successfully (${html.length} bytes)\n`);
    
    // Check for various elements that might contain listings
    const searches = [
      { selector: 'a[href*="/for-rent/"]', name: 'Links with /for-rent/' },
      { selector: 'a[href*="casa"]', name: 'Links with casa' },
      { selector: 'a[href*="departamento"]', name: 'Links with departamento' },
      { selector: '[class*="listing"]', name: 'Elements with listing in class' },
      { selector: '[class*="property"]', name: 'Elements with property in class' },
      { selector: '[class*="result"]', name: 'Elements with result in class' },
      { selector: '[data-test]', name: 'Elements with data-test attribute' },
      { selector: 'article', name: 'Article elements' },
      { selector: '[itemtype]', name: 'Elements with itemtype' },
      { selector: 'img[alt*="casa"], img[alt*="departamento"]', name: 'Property images' }
    ];
    
    searches.forEach(({ selector, name }) => {
      const count = $(selector).length;
      console.log(`${name}: ${count} found`);
      
      if (count > 0 && count < 5) {
        $(selector).slice(0, 3).each((i, el) => {
          const $el = $(el);
          console.log(`  ${i + 1}. Tag: ${el.tagName}, Class: ${$el.attr('class') || 'none'}`);
        });
      }
    });
    
    // Look for prices
    console.log('\n💰 Price patterns:');
    const pricePatterns = [
      /\$[\d,]+\s*(MXN|USD)?/g,
      /MXN\s*[\d,]+/g,
      /[\d,]+\s*pesos/gi
    ];
    
    pricePatterns.forEach(pattern => {
      const matches = html.match(pattern) || [];
      if (matches.length > 0) {
        console.log(`Pattern ${pattern}: ${matches.length} matches`);
        console.log(`  Examples: ${matches.slice(0, 3).join(', ')}`);
      }
    });
    
    // Check page title and meta
    console.log('\n📄 Page info:');
    console.log(`Title: ${$('title').text()}`);
    console.log(`H1: ${$('h1').first().text()}`);
    
    // Check for JSON-LD data
    const jsonLd = $('script[type="application/ld+json"]');
    console.log(`\n📊 JSON-LD scripts found: ${jsonLd.length}`);
    
    // Check for specific Lamudi elements
    console.log('\n🏠 Checking for Lamudi-specific elements:');
    const lamudiSelectors = [
      '.ListingCell-row',
      '.ListingCell-KeyInfo-title',
      '.PriceSection-FirstPrice',
      '.ListingCell-KeyInfo-address',
      '.KeyInformation-attribute'
    ];
    
    lamudiSelectors.forEach(selector => {
      const count = $(selector).length;
      if (count > 0) {
        console.log(`✅ Found ${selector}: ${count} elements`);
      }
    });
    
    // Save a snippet for manual inspection
    const snippet = html.substring(10000, 15000).replace(/\s+/g, ' ');
    console.log('\n📝 HTML snippet (chars 10000-15000):');
    console.log(snippet.substring(0, 500) + '...');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response?.data) {
      console.error('Response:', error.response.data);
    }
  }
}

testLamudiStructure();