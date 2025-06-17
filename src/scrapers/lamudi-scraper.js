import axios from 'axios';
import * as cheerio from 'cheerio';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// Logger utility
class Logger {
  constructor(name) {
    this.name = name;
  }

  info(message, data = {}) {
    console.log(JSON.stringify({
      level: 'info',
      module: this.name,
      message,
      ...data,
      timestamp: new Date().toISOString()
    }));
  }

  error(message, error, data = {}) {
    console.error(JSON.stringify({
      level: 'error',
      module: this.name,
      message,
      error: error?.message || error,
      stack: error?.stack,
      ...data,
      timestamp: new Date().toISOString()
    }));
  }

  debug(message, data = {}) {
    if (process.env.LOG_LEVEL === 'debug') {
      console.log(JSON.stringify({
        level: 'debug',
        module: this.name,
        message,
        ...data,
        timestamp: new Date().toISOString()
      }));
    }
  }
}

export class LamudiScraper {
  constructor() {
    this.logger = new Logger('LamudiScraper');
    this.scrapeDoUrl = process.env.SCRAPEDO_API_URL || 'https://api.scrape.do';
    this.token = process.env.SCRAPEDO_TOKEN || '';
    this.baseUrl = 'https://www.lamudi.com.mx';
    
    // Initialize PostgreSQL connection
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: {
        rejectUnauthorized: false
      }
    });
  }

  /**
   * Main function to scrape Lamudi and save to Supabase
   */
  async scrapeLamudiToSupabase(city, type) {
    const result = {
      added: 0,
      updated: 0,
      errors: 0,
      total: 0
    };

    try {
      this.logger.info('Starting Lamudi scrape', { city, type });

      // Build search URL
      const searchUrl = this.buildSearchUrl(city, type);
      
      // Scrape listings
      const listings = await this.scrapeAllPages(searchUrl, type);
      result.total = listings.length;

      this.logger.info('Scraped listings', { count: listings.length });

      // Process each listing
      for (const listing of listings) {
        try {
          const exists = await this.checkIfExists(listing.link);
          
          if (exists) {
            await this.updateListing(listing);
            result.updated++;
          } else {
            await this.insertListing(listing);
            result.added++;
          }
        } catch (error) {
          this.logger.error('Failed to process listing', error, { 
            title: listing.title,
            link: listing.link 
          });
          result.errors++;
        }
      }

      // Update last scraped timestamp
      await this.updateLastScrapedTimestamp(city, type);

      this.logger.info('Lamudi scrape completed', result);
      return result;

    } catch (error) {
      this.logger.error('Lamudi scrape failed', error);
      throw error;
    }
  }

  /**
   * Build search URL for Lamudi
   */
  buildSearchUrl(city, type) {
    const citySlug = this.getCitySlug(city);
    const typeSlug = type === 'rent' ? 'for-rent' : 'for-sale';
    return `${this.baseUrl}/${citySlug}/${typeSlug}/`;
  }

  /**
   * Convert city name to URL slug
   */
  getCitySlug(city) {
    const cityMap = {
      'mexico city': 'distrito-federal',
      'ciudad de mexico': 'distrito-federal',
      'cdmx': 'distrito-federal',
      'guadalajara': 'jalisco/guadalajara',
      'monterrey': 'nuevo-leon/monterrey',
      'cancun': 'quintana-roo/benito-juarez',
      'playa del carmen': 'quintana-roo/solidaridad',
      'puebla': 'puebla/puebla',
      'queretaro': 'queretaro/queretaro',
      'merida': 'yucatan/merida'
    };

    return cityMap[city.toLowerCase()] || city.toLowerCase().replace(/\s+/g, '-');
  }

  /**
   * Scrape all pages with pagination
   */
  async scrapeAllPages(baseUrl, type, maxPages = 10) {
    const allListings = [];
    let page = 1;

    while (page <= maxPages) {
      try {
        const url = page === 1 ? baseUrl : `${baseUrl}?page=${page}`;
        this.logger.info('Scraping page', { page, url });

        const listings = await this.scrapePage(url, type);
        
        if (listings.length === 0) {
          this.logger.info('No more listings found', { page });
          break;
        }

        allListings.push(...listings);
        page++;

        // Rate limiting
        await this.sleep(2000);
      } catch (error) {
        this.logger.error('Failed to scrape page', error, { page });
        break;
      }
    }

    return allListings;
  }

  /**
   * Scrape a single page
   */
  async scrapePage(url, operationType) {
    try {
      const html = await this.fetchWithScrapeDo(url);
      const $ = cheerio.load(html);
      const listings = [];

      // Lamudi uses different selectors, try multiple
      const listingSelectors = [
        '.listings__cards > div',
        '.listings__cards > a',
        '.ListingCell-row',
        '.js-listing-link',
        'div[data-listing-id]',
        '.listing-card',
        'article.listing',
        '.property-card'
      ];

      let listingElements = $();
      for (const selector of listingSelectors) {
        listingElements = $(selector);
        if (listingElements.length > 0) {
          this.logger.debug('Found listings with selector', { selector, count: listingElements.length });
          break;
        }
      }

      if (listingElements.length === 0) {
        this.logger.debug('No listings found, HTML preview', { 
          html: html.substring(0, 500) 
        });
      }

      listingElements.each((_, element) => {
        try {
          const listing = this.extractListing($, element, operationType);
          if (listing) {
            listings.push(listing);
          }
        } catch (error) {
          this.logger.error('Failed to extract listing', error);
        }
      });

      return listings;
    } catch (error) {
      this.logger.error('Failed to scrape page', error, { url });
      throw error;
    }
  }

  /**
   * Extract listing data from HTML element
   */
  extractListing($, element, operationType) {
    const $el = $(element);

    // Extract link and ID
    const linkElement = $el.find('a[href]').first();
    const link = linkElement.attr('href') || '';
    
    if (!link) {
      this.logger.debug('No link found for listing');
      return null;
    }

    const fullLink = link.startsWith('http') ? link : `${this.baseUrl}${link}`;
    
    // Generate ID from URL - handle both /desarrollo/ and /detalle/ URLs
    const urlParts = link.split('/');
    const slug = urlParts[urlParts.length - 1] || urlParts[urlParts.length - 2];
    const external_id = `LAMUDI-${slug}`.replace(/[^a-zA-Z0-9-]/g, '').substring(0, 50);

    if (!external_id || external_id === 'LAMUDI-') return null;

    // Extract title from image alt or text content
    const imgAlt = $el.find('img').first().attr('alt') || '';
    const textContent = $el.text().replace(/\s+/g, ' ').trim();
    
    let title = imgAlt.trim();
    if (!title) {
      // Try to extract from text content, looking for property type
      const titleMatch = textContent.match(/(Casa|Departamento|Local|Oficina|Bodega|Terreno)[^,]+/i);
      title = titleMatch ? titleMatch[0].trim() : 'Sin título';
    }

    // Extract price from text content
    const priceMatch = textContent.match(/\$[\d,]+(\s*(MXN|USD|pesos))?/);
    const price = priceMatch ? priceMatch[0].replace(/[^\d]/g, '') : '0';
    const currency = priceMatch && priceMatch[0].includes('USD') ? 'USD' : 'MXN';

    // Extract location from text content
    const locationMatch = textContent.match(/([^,]+),\s*([^,]+),\s*Ciudad de México/);
    const location = locationMatch ? locationMatch[0] : 'Ciudad de México';

    // Parse location
    const locationParts = this.parseLocation(location);

    // Use the text content for attributes
    const attributesText = textContent;
    
    // Extract bedrooms
    let bedrooms = 0;
    const bedroomSelectors = [
      '.icon-bedrooms + span',
      '[class*="bedroom"]',
      '.bedrooms'
    ];
    
    for (const selector of bedroomSelectors) {
      const bedroomText = $el.find(selector).text();
      const match = bedroomText.match(/(\d+)/);
      if (match) {
        bedrooms = parseInt(match[1]);
        break;
      }
    }

    if (bedrooms === 0) {
      const bedroomMatch = attributesText.match(/(\d+)\s*(recámaras?|habitaciones?|bedrooms?|rec\.)/i);
      if (bedroomMatch) {
        bedrooms = parseInt(bedroomMatch[1]);
      }
    }

    // Extract bathrooms
    let bathrooms = 0;
    const bathroomSelectors = [
      '.icon-bathrooms + span',
      '[class*="bathroom"]',
      '.bathrooms'
    ];
    
    for (const selector of bathroomSelectors) {
      const bathroomText = $el.find(selector).text();
      const match = bathroomText.match(/(\d+)/);
      if (match) {
        bathrooms = parseInt(match[1]);
        break;
      }
    }

    if (bathrooms === 0) {
      const bathroomMatch = attributesText.match(/(\d+)\s*(baños?|bathrooms?)/i);
      if (bathroomMatch) {
        bathrooms = parseInt(bathroomMatch[1]);
      }
    }

    // Extract area
    let size = '0';
    let area_m2 = 0;
    const areaSelectors = [
      '.icon-area + span',
      '[class*="area"]',
      '.square-meters'
    ];
    
    for (const selector of areaSelectors) {
      const areaText = $el.find(selector).text();
      const match = areaText.match(/(\d+)/);
      if (match) {
        size = match[1];
        area_m2 = parseInt(match[1]);
        break;
      }
    }

    if (area_m2 === 0) {
      const areaMatch = attributesText.match(/(\d+)\s*m[²2]/i);
      if (areaMatch) {
        size = areaMatch[1];
        area_m2 = parseInt(areaMatch[1]);
      }
    }

    // Extract image
    const imageElement = $el.find('img').first();
    const image_url = imageElement.attr('src') || 
                      imageElement.attr('data-src') || 
                      imageElement.attr('data-original') ||
                      '';

    // Extract description from text content
    const description = textContent.length > 100 ? 
                       textContent.substring(0, 300).trim() + '...' : 
                       `${title} - ${location}`;

    // Determine property type from title or attributes
    const titleLower = title.toLowerCase();
    const descLower = description.toLowerCase();
    let property_type = 'Casa';
    
    if (titleLower.includes('departamento') || titleLower.includes('depa') || 
        descLower.includes('departamento')) {
      property_type = 'Departamento';
    } else if (titleLower.includes('terreno') || descLower.includes('terreno')) {
      property_type = 'Terreno';
    } else if (titleLower.includes('oficina') || descLower.includes('oficina')) {
      property_type = 'Oficina';
    } else if (titleLower.includes('local') || descLower.includes('local comercial')) {
      property_type = 'Local';
    } else if (titleLower.includes('bodega') || descLower.includes('bodega')) {
      property_type = 'Bodega';
    }

    return {
      external_id,
      title,
      price,
      currency,
      location,
      city: locationParts.city,
      state: locationParts.state,
      country: 'Mexico',
      bedrooms,
      bathrooms,
      size,
      property_type,
      link: fullLink,
      description,
      image_url,
      source: 'lamudi',
      operation_type: operationType,
      area_m2,
      last_scraped_at: new Date()
    };
  }

  /**
   * Parse location string
   */
  parseLocation(location) {
    const parts = location.split(',').map(p => p.trim());
    
    let city = '';
    let state = '';

    if (parts.length >= 2) {
      // Usually format is: "Colonia, Delegación/Municipio, Estado"
      if (parts.length >= 3) {
        city = parts[parts.length - 2];
        state = parts[parts.length - 1];
      } else {
        city = parts[0];
        state = parts[1];
      }
      
      // Normalize common state names
      const stateMap = {
        'CDMX': 'Ciudad de México',
        'Distrito Federal': 'Ciudad de México',
        'DF': 'Ciudad de México',
        'Ciudad de México': 'Ciudad de México',
        'Estado de México': 'Estado de México',
        'Edo. Méx.': 'Estado de México',
        'Edo. de México': 'Estado de México',
        'Jalisco': 'Jalisco',
        'Nuevo León': 'Nuevo León',
        'Querétaro': 'Querétaro',
        'Quintana Roo': 'Quintana Roo',
        'Yucatán': 'Yucatán'
      };
      
      // Find matching state
      for (const [key, value] of Object.entries(stateMap)) {
        if (state.toLowerCase().includes(key.toLowerCase())) {
          state = value;
          break;
        }
      }
    } else {
      city = parts[0] || location;
      state = 'México';
    }

    return { city, state };
  }

  /**
   * Fetch page using Scrape.do
   */
  async fetchWithScrapeDo(url) {
    if (!this.token) {
      throw new Error('SCRAPEDO_TOKEN is required');
    }

    try {
      this.logger.debug('Fetching with Scrape.do', { url });
      
      const response = await axios.get(this.scrapeDoUrl, {
        params: {
          token: this.token,
          url: url,  // Don't encode here, axios will handle it
          render: 'true',
          geoCode: 'mx'
        },
        timeout: 60000
      });

      return response.data;
    } catch (error) {
      this.logger.error('Scrape.do request failed', error, { url });
      throw error;
    }
  }

  /**
   * Check if listing exists in database
   */
  async checkIfExists(sourceUrl) {
    const query = 'SELECT 1 FROM properties WHERE link = $1 LIMIT 1';
    const result = await this.pool.query(query, [sourceUrl]);
    return result.rows.length > 0;
  }

  /**
   * Insert new listing
   */
  async insertListing(listing) {
    const query = `
      INSERT INTO properties (
        external_id, title, price, currency, location, city, state, country,
        bedrooms, bathrooms, size, property_type, link, description,
        image_url, source, created_at, updated_at, last_seen_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW(), NOW(), NOW()
      )
    `;

    const values = [
      listing.external_id,
      listing.title,
      listing.price,
      listing.currency,
      listing.location,
      listing.city,
      listing.state,
      listing.country,
      listing.bedrooms,
      listing.bathrooms,
      listing.size,
      listing.property_type,
      listing.link,
      listing.description,
      listing.image_url,
      listing.source
    ];

    await this.pool.query(query, values);
    this.logger.debug('Inserted listing', { external_id: listing.external_id });
  }

  /**
   * Update existing listing
   */
  async updateListing(listing) {
    const query = `
      UPDATE properties SET
        title = $2,
        price = $3,
        currency = $4,
        location = $5,
        city = $6,
        state = $7,
        bedrooms = $8,
        bathrooms = $9,
        size = $10,
        property_type = $11,
        description = $12,
        image_url = $13,
        updated_at = NOW(),
        last_seen_at = NOW()
      WHERE link = $1
    `;

    const values = [
      listing.link,
      listing.title,
      listing.price,
      listing.currency,
      listing.location,
      listing.city,
      listing.state,
      listing.bedrooms,
      listing.bathrooms,
      listing.size,
      listing.property_type,
      listing.description,
      listing.image_url
    ];

    await this.pool.query(query, values);
    this.logger.debug('Updated listing', { link: listing.link });
  }

  /**
   * Update last scraped timestamp
   */
  async updateLastScrapedTimestamp(city, type) {
    const query = `
      INSERT INTO scraper_metadata (key, value, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()
    `;

    const key = `lamudi_last_scraped_${city}_${type}`;
    const value = new Date().toISOString();

    try {
      await this.pool.query(query, [key, value]);
    } catch (error) {
      // Table might not exist, log but don't fail
      this.logger.debug('Could not update scraper metadata', { error: error.message });
    }
  }

  /**
   * Utility sleep function
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Close database connection
   */
  async close() {
    await this.pool.end();
  }
}

// Export a convenience function
export async function scrapeLamudiToSupabase(city, type) {
  const scraper = new LamudiScraper();
  try {
    return await scraper.scrapeLamudiToSupabase(city, type);
  } finally {
    await scraper.close();
  }
}

// Example usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const city = process.argv[2] || 'mexico city';
  const type = process.argv[3] || 'rent';

  scrapeLamudiToSupabase(city, type)
    .then(result => {
      console.log('\n✅ Scraping completed!');
      console.log(`📊 Results: ${result.added} added, ${result.updated} updated, ${result.errors} errors`);
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Scraping failed:', error);
      process.exit(1);
    });
}