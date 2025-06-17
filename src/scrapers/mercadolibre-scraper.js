import axios from 'axios';
import * as cheerio from 'cheerio';
import { Logger } from '../utils/logger.js';

export class MercadoLibreScraper {
  constructor() {
    this.logger = new Logger('MercadoLibreScraper');
    this.baseUrl = 'https://inmuebles.mercadolibre.com.mx';
    this.propertyIdCounter = 1;
  }

  async scrapeListings(url) {
    try {
      this.logger.info('Starting MercadoLibre scraping', { url });
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      const $ = cheerio.load(response.data);
      const listings = [];

      $('.ui-search-layout__item').each((index, element) => {
        try {
          const listing = this.extractListing($, element);
          if (listing) {
            listings.push(listing);
          }
        } catch (error) {
          this.logger.error('Failed to extract listing', error, { index });
        }
      });

      this.logger.info('Scraping completed', { 
        totalListings: listings.length,
        url 
      });

      return listings;
    } catch (error) {
      this.logger.error('Failed to scrape MercadoLibre', error, { url });
      throw error;
    }
  }

  extractListing($, element) {
    const $el = $(element);
    
    // Extract URL and ID
    const link = $el.find('a.ui-search-result__link').attr('href') || '';
    const idMatch = link.match(/MLM-(\d+)/);
    const id = idMatch ? `ML${idMatch[1]}` : `ML${Date.now()}-${this.propertyIdCounter++}`;

    // Extract title
    const title = $el.find('h2.ui-search-item__title').text().trim() || 
                  $el.find('[class*="title"]').first().text().trim() || 
                  'Sin título';

    // Extract price
    const priceText = $el.find('.andes-money-amount__fraction').first().text().trim() ||
                      $el.find('.price-tag-fraction').first().text().trim() || '0';
    const priceMatch = priceText.match(/[\d,]+/);
    const price = priceMatch ? parseFloat(priceMatch[0].replace(/,/g, '')) : 0;

    // Extract location
    const location = $el.find('.ui-search-item__location').text().trim() ||
                     $el.find('[class*="location"]').text().trim() || 
                     'México';

    // Extract attributes - try multiple selectors as MercadoLibre changes their HTML
    const attributes = [];
    
    // Try different attribute selectors
    const attributeSelectors = [
      '.poly-attributes_list__item',
      '.ui-search-card-attributes__attribute',
      '.ui-search-attributes__attribute',
      '[class*="attribute"][class*="item"]'
    ];
    
    let foundAttributes = false;
    for (const selector of attributeSelectors) {
      const elements = $el.find(selector);
      if (elements.length > 0) {
        elements.each((i, attr) => {
          const text = $(attr).text().trim();
          if (text) {
            attributes.push(text);
          }
        });
        foundAttributes = true;
        break;
      }
    }
    
    // If no attributes found with specific selectors, try to find them in a container
    if (!foundAttributes) {
      const containerSelectors = [
        '.poly-component__attributes-list',
        '.poly-attributes_list',
        '.ui-search-card-attributes'
      ];
      
      for (const containerSelector of containerSelectors) {
        const container = $el.find(containerSelector).first();
        if (container.length > 0) {
          // Look for text that matches patterns
          const containerText = container.text();
          const patterns = [
            /(\d+)\s*(recámaras?|habitacion(?:es)?)/gi,
            /(\d+)\s*(baños?)/gi,
            /(\d+(?:\s*-\s*\d+)?)\s*m²/gi
          ];
          
          patterns.forEach(pattern => {
            const matches = containerText.matchAll(pattern);
            for (const match of matches) {
              attributes.push(match[0].trim());
            }
          });
          
          if (attributes.length > 0) {
            foundAttributes = true;
            break;
          }
        }
      }
    }

    // Parse attributes
    let size = null;
    let bedrooms = null;
    let bathrooms = null;

    attributes.forEach(attr => {
      // Area/Size - handle ranges like "286 - 298 m²"
      const sizeMatch = attr.match(/(\d+)(?:\s*-\s*(\d+))?\s*m²/);
      if (sizeMatch) {
        if (sizeMatch[2]) {
          // If it's a range, take the average
          size = Math.round((parseInt(sizeMatch[1]) + parseInt(sizeMatch[2])) / 2);
        } else {
          size = parseInt(sizeMatch[1]);
        }
      }

      // Bedrooms
      if (attr.toLowerCase().includes('recámara') || attr.toLowerCase().includes('habitación')) {
        const numMatch = attr.match(/(\d+)(?:\s*a\s*(\d+))?/);
        if (numMatch) {
          if (numMatch[2]) {
            // If it's a range like "3 a 4", take the first number
            bedrooms = parseInt(numMatch[1]);
          } else {
            bedrooms = parseInt(numMatch[1]);
          }
        }
      }

      // Bathrooms
      if (attr.toLowerCase().includes('baño')) {
        const numMatch = attr.match(/(\d+)(?:\s*a\s*(\d+))?/);
        if (numMatch) {
          if (numMatch[2]) {
            // If it's a range like "3 a 4", take the first number
            bathrooms = parseInt(numMatch[1]);
          } else {
            bathrooms = parseInt(numMatch[1]);
          }
        }
      }
    });

    // Determine property type
    const titleLower = title.toLowerCase();
    let propertyType = 'Inmueble';
    if (titleLower.includes('casa')) {
      propertyType = 'Casa';
    } else if (titleLower.includes('departamento') || titleLower.includes('depto')) {
      propertyType = 'Departamento';
    } else if (titleLower.includes('terreno')) {
      propertyType = 'Terreno';
    } else if (titleLower.includes('local')) {
      propertyType = 'Local';
    } else if (titleLower.includes('oficina')) {
      propertyType = 'Oficina';
    }

    return {
      id,
      title,
      price,
      address: location,
      bedrooms,
      bathrooms,
      area_sqm: size,
      source: 'mercadolibre',
      url: link,
      property_type: propertyType,
      raw_attributes: attributes
    };
  }

  async scrapeMultiplePages(baseUrl, maxPages = 5) {
    const allListings = [];
    
    for (let page = 1; page <= maxPages; page++) {
      try {
        const offset = (page - 1) * 48; // MercadoLibre uses 48 items per page
        const url = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}_Desde_${offset + 1}`;
        
        this.logger.info('Scraping page', { page, url });
        const listings = await this.scrapeListings(url);
        
        if (listings.length === 0) {
          this.logger.info('No more listings found', { page });
          break;
        }
        
        allListings.push(...listings);
        
        // Be respectful with delays
        if (page < maxPages) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (error) {
        this.logger.error('Failed to scrape page', error, { page });
      }
    }
    
    return allListings;
  }
}