import axios from 'axios';
import * as cheerio from 'cheerio';
import { Logger } from '../utils/logger.js';

export class MercadoLibreScraperImproved {
  constructor() {
    this.logger = new Logger('MercadoLibreScraperImproved');
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
    const linkElement = $el.find('a.ui-search-link, a.ui-search-result__link, a[href*="/MLM-"]').first();
    const link = linkElement.attr('href') || '';
    const fullLink = link ? (link.startsWith('http') ? link : `${this.baseUrl}${link}`) : '';
    
    const idMatch = link.match(/MLM-(\d+)/);
    const externalId = idMatch ? `MLM-${idMatch[1]}` : `ML${Date.now()}-${this.propertyIdCounter++}`;

    // Extract title
    const title = $el.find('h2.ui-search-item__title, .ui-search-item__group__element .ui-search-item__title').text().trim() || 
                  $el.find('[class*="title"]').first().text().trim() || 
                  'Sin título';

    // Extract price - handle "Desde" prefix
    const priceContainer = $el.find('.andes-money-amount, .price-tag').first();
    const priceText = priceContainer.find('.andes-money-amount__fraction, .price-tag-fraction').first().text().trim() || '0';
    const priceMatch = priceText.match(/[\d,]+/);
    const priceValue = priceMatch ? parseFloat(priceMatch[0].replace(/,/g, '')) : 0;
    
    // Extract currency (usually MXN)
    const currency = priceContainer.find('.andes-money-amount__currency-symbol').text().trim() || 'MXN';

    // Extract location - more detailed parsing
    const locationText = $el.find('.ui-search-item__location, .ui-search-item__group__element:contains("Col."), .ui-search-item__group__element:contains(",")').text().trim() ||
                     $el.find('[class*="location"]').text().trim() || 
                     'México';

    // Parse location into components
    const locationParts = this.parseLocation(locationText);

    // Extract attributes with improved selectors
    const attributes = [];
    
    // Multiple possible attribute selectors
    const attributeSelectors = [
      '.poly-attributes_list__item',
      '.ui-search-card-attributes__attribute',
      '.ui-search-attributes__attribute',
      '.ui-search-item__group__element span',
      '[class*="attribute"] span'
    ];
    
    let foundAttributes = false;
    for (const selector of attributeSelectors) {
      const elements = $el.find(selector);
      if (elements.length > 0) {
        elements.each((i, attr) => {
          const text = $(attr).text().trim();
          if (text && text.match(/\d+/)) {
            attributes.push(text);
          }
        });
        foundAttributes = true;
        break;
      }
    }

    // Parse attributes for bedrooms, bathrooms, and size
    let bedrooms = 0;
    let bathrooms = 0;
    let size = "0";

    attributes.forEach(attr => {
      // More flexible size parsing - m² or m2
      const sizeMatch = attr.match(/(\d+)(?:\s*[-a]\s*(\d+))?\s*m[²2]/i);
      if (sizeMatch) {
        if (sizeMatch[2]) {
          // Range: take average
          size = String(Math.round((parseInt(sizeMatch[1]) + parseInt(sizeMatch[2])) / 2));
        } else {
          size = sizeMatch[1];
        }
      }

      // Bedrooms - handle various terms
      if (attr.match(/(recámara|habitaci[óo]n|dormitorio)/i)) {
        const numMatch = attr.match(/(\d+)(?:\s*[-a]\s*(\d+))?/);
        if (numMatch) {
          bedrooms = parseInt(numMatch[1]);
        }
      }

      // Bathrooms
      if (attr.match(/(baño|sanitario)/i)) {
        const numMatch = attr.match(/(\d+)(?:\s*[-a]\s*(\d+))?/);
        if (numMatch) {
          bathrooms = parseInt(numMatch[1]);
        }
      }
    });

    // Extract image URL
    const imageUrl = $el.find('img.ui-search-result-image__element, img[data-src], img[src*="http"]').first().attr('data-src') || 
                     $el.find('img').first().attr('src') || null;

    // Determine property type
    const titleLower = title.toLowerCase();
    let propertyType = 'Casa'; // Default for this search
    if (titleLower.includes('departamento') || titleLower.includes('depto')) {
      propertyType = 'Departamento';
    } else if (titleLower.includes('terreno')) {
      propertyType = 'Terreno';
    } else if (titleLower.includes('local')) {
      propertyType = 'Local';
    } else if (titleLower.includes('oficina')) {
      propertyType = 'Oficina';
    }

    // Build description
    const description = `${title} - ${locationText}`;

    // Log missing fields for debugging
    if (!bedrooms || !bathrooms || size === "0") {
      this.logger.debug('Missing property details', {
        externalId,
        title: title.substring(0, 50),
        bedrooms,
        bathrooms,
        size,
        attributes
      });
    }

    return {
      external_id: externalId,
      title,
      price: String(priceValue),
      currency,
      location: locationText,
      city: locationParts.city,
      state: locationParts.state,
      country: 'Mexico',
      bedrooms,
      bathrooms,
      size,
      property_type: propertyType,
      link: fullLink,
      description,
      image_url: imageUrl,
      source: 'mercadolibre',
      raw_attributes: attributes
    };
  }

  /**
   * Parse location string into structured components
   * @param {string} location - Raw location string
   * @returns {object} - Parsed location with city and state
   */
  parseLocation(location) {
    // Common patterns in MercadoLibre locations
    const parts = location.split(',').map(p => p.trim());
    
    let city = '';
    let state = '';

    // Handle different location formats
    if (parts.length >= 2) {
      // Last part is usually the state
      state = parts[parts.length - 1];
      
      // Common state name mappings
      const stateMap = {
        'Estado De México': 'Estado de México',
        'Distrito Federal': 'Ciudad de México',
        'Cdmx': 'Ciudad de México',
        'Df': 'Ciudad de México',
        'Edo. De México': 'Estado de México',
        'Edomex': 'Estado de México'
      };
      
      // Normalize state name
      Object.keys(stateMap).forEach(key => {
        if (state.toLowerCase().includes(key.toLowerCase())) {
          state = stateMap[key];
        }
      });
      
      // City is usually the second-to-last part
      if (parts.length >= 3) {
        city = parts[parts.length - 2];
      } else {
        city = parts[0];
      }
      
      // Clean up city name - remove "Col." prefix if it's the full city
      if (city.startsWith('Col.')) {
        city = parts.length > 2 ? parts[parts.length - 3] : city;
      }
    } else if (parts.length === 1) {
      // Single part - assume it's the city
      city = parts[0];
      state = 'México'; // Default state
    }

    return {
      city: city || location,
      state: state || 'México'
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