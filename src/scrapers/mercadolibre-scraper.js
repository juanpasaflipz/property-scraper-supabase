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

      $('.ui-search-results__item').each((index, element) => {
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

    // Extract attributes
    const attributes = [];
    $el.find('.ui-search-card-attributes__attribute').each((i, attr) => {
      attributes.push($(attr).text().trim());
    });

    // Parse attributes
    let size = null;
    let bedrooms = null;
    let bathrooms = null;

    attributes.forEach(attr => {
      // Area/Size
      const sizeMatch = attr.match(/(\d+)\s*m²/);
      if (sizeMatch) {
        size = parseInt(sizeMatch[1]);
      }

      // Bedrooms
      if (attr.toLowerCase().includes('recámara') || attr.toLowerCase().includes('habitación')) {
        const numMatch = attr.match(/(\d+)/);
        if (numMatch) {
          bedrooms = parseInt(numMatch[1]);
        }
      }

      // Bathrooms
      if (attr.toLowerCase().includes('baño')) {
        const numMatch = attr.match(/(\d+)/);
        if (numMatch) {
          bathrooms = parseInt(numMatch[1]);
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