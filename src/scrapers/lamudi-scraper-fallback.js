import axios from 'axios';
import * as cheerio from 'cheerio';
import pg from 'pg';
import dotenv from 'dotenv';
import { Logger } from '../utils/logger.js';

dotenv.config();

const { Pool } = pg;

export class LamudiScraperWithFallback {
  constructor() {
    this.logger = new Logger('LamudiScraperWithFallback');
    this.scrapeDoUrl = process.env.SCRAPEDO_API_URL || 'https://api.scrape.do';
    this.token = process.env.SCRAPEDO_TOKEN || '';
    this.baseUrl = 'https://www.lamudi.com.mx';
    this.useScrapeDo = process.env.USE_SCRAPEDO === 'true' && this.token;
    
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
      this.logger.info('Starting Lamudi scrape', { city, type, useScrapeDo: this.useScrapeDo });

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
  async scrapeAllPages(baseUrl, type, maxPages = 5) {
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
      const html = await this.fetchPage(url);
      const $ = cheerio.load(html);
      const listings = [];

      // Lamudi selectors
      const listingSelectors = [
        '.listings__cards > div',
        '.listings__cards > a',
        '.ListingCell-row',
        '.js-listing-link',
        'div[data-listing-id]',
        '.listing-card',
        'article.listing',
        '.property-card',
        '.ui-listing-card',
        '.result-list-item',
        '[data-test="result-listing"]',
        '.listings-container .listing',
        'div[itemtype="http://schema.org/Residence"]'
      ];

      let listingElements = $();
      for (const selector of listingSelectors) {
        listingElements = $(selector);
        if (listingElements.length > 0) {
          this.logger.info('Found listings with selector', { selector, count: listingElements.length });
          break;
        }
      }

      if (listingElements.length === 0) {
        this.logger.info('No listings found with standard selectors, checking HTML', { 
          htmlLength: html.length,
          preview: html.substring(0, 500).replace(/\s+/g, ' ')
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

    // Extract link
    const linkElement = $el.find('a').first();
    const link = linkElement.attr('href') || $el.attr('href') || '';
    
    if (!link) return null;

    const fullLink = link.startsWith('http') ? link : `${this.baseUrl}${link}`;
    
    // Generate ID from URL
    const urlParts = link.split('/');
    const slug = urlParts[urlParts.length - 1] || urlParts[urlParts.length - 2];
    const external_id = `LAMUDI-${slug}`.replace(/[^a-zA-Z0-9-]/g, '').substring(0, 50);

    if (!external_id || external_id === 'LAMUDI-') return null;

    // Extract title
    const title = $el.find('.ListingCell-KeyInfo-title, h3, h2, .listing-title').first().text().trim() || 
                  $el.find('[class*="title"]').first().text().trim() || 
                  'Sin título';

    // Extract price
    const priceText = $el.find('.PriceSection-FirstPrice, .listing-price, [class*="price"]').first().text().trim();
    const priceMatch = priceText.match(/[\d,]+/);
    const price = priceMatch ? priceMatch[0].replace(/,/g, '') : '0';
    const currency = priceText.includes('USD') ? 'USD' : 'MXN';

    // Extract location
    const location = $el.find('.ListingCell-KeyInfo-address, .listing-location, [class*="location"]').text().trim() || 
                     'México';

    const locationParts = this.parseLocation(location);

    // Extract attributes
    const attributesText = $el.text();
    
    // Extract bedrooms
    let bedrooms = 0;
    const bedroomMatch = attributesText.match(/(\d+)\s*(recámaras?|rec\.)/i);
    if (bedroomMatch) bedrooms = parseInt(bedroomMatch[1]);

    // Extract bathrooms
    let bathrooms = 0;
    const bathroomMatch = attributesText.match(/(\d+)\s*(baños?)/i);
    if (bathroomMatch) bathrooms = parseInt(bathroomMatch[1]);

    // Extract area
    let size = '0';
    const areaMatch = attributesText.match(/(\d+)\s*m[²2]/i);
    if (areaMatch) size = areaMatch[1];

    // Extract image
    const imageElement = $el.find('img').first();
    const image_url = imageElement.attr('data-src') || 
                      imageElement.attr('src') || 
                      '';

    // Extract description
    const description = `${title} - ${location}`;

    // Determine property type
    const titleLower = title.toLowerCase();
    let property_type = 'Casa';
    
    if (titleLower.includes('departamento') || titleLower.includes('depa')) {
      property_type = 'Departamento';
    } else if (titleLower.includes('terreno')) {
      property_type = 'Terreno';
    } else if (titleLower.includes('oficina')) {
      property_type = 'Oficina';
    } else if (titleLower.includes('local')) {
      property_type = 'Local';
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
      source: 'lamudi'
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
      if (parts.length >= 3) {
        city = parts[parts.length - 2];
        state = parts[parts.length - 1];
      } else {
        city = parts[0];
        state = parts[1];
      }
      
      // Normalize state names
      const stateMap = {
        'CDMX': 'Ciudad de México',
        'Distrito Federal': 'Ciudad de México',
        'DF': 'Ciudad de México'
      };
      
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
   * Fetch page with fallback
   */
  async fetchPage(url) {
    if (this.useScrapeDo) {
      try {
        return await this.fetchWithScrapeDo(url);
      } catch (error) {
        this.logger.info('Scrape.do failed, falling back to direct fetch', { error: error.message });
        return await this.fetchDirect(url);
      }
    } else {
      return await this.fetchDirect(url);
    }
  }

  /**
   * Fetch page using Scrape.do
   */
  async fetchWithScrapeDo(url) {
    const response = await axios.get(this.scrapeDoUrl, {
      params: {
        token: this.token,
        url: url,
        render: 'true',
        geoCode: 'mx'
      },
      timeout: 60000
    });

    return response.data;
  }

  /**
   * Fetch page directly
   */
  async fetchDirect(url) {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-MX,es;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive'
      },
      timeout: 30000
    });

    return response.data;
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

// Export convenience function
export async function scrapeLamudiToSupabase(city, type) {
  const scraper = new LamudiScraperWithFallback();
  try {
    return await scraper.scrapeLamudiToSupabase(city, type);
  } finally {
    await scraper.close();
  }
}