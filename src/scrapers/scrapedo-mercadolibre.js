import axios from 'axios';
import * as cheerio from 'cheerio';
import { Logger } from '../utils/logger.js';

export class ScrapedoMercadoLibreScraper {
  constructor() {
    this.logger = new Logger('ScrapedoMercadoLibreScraper');
    this.baseUrl = 'https://inmuebles.mercadolibre.com.mx';
    this.scrapeDoUrl = process.env.SCRAPEDO_API_URL || 'https://api.scrape.do';
    this.token = process.env.SCRAPEDO_TOKEN;
  }

  async scrapeWithScrapeDo(targetUrl) {
    if (!this.token) {
      throw new Error('SCRAPEDO_TOKEN is required');
    }

    try {
      this.logger.info('Fetching via Scrape.do', { targetUrl });
      
      const response = await axios.get(this.scrapeDoUrl, {
        params: {
          token: this.token,
          url: targetUrl,
          render: true, // Enable JavaScript rendering
          premium: true, // Use premium proxies
          geoCode: 'mx' // Use Mexican proxies
        },
        timeout: 60000 // 60 second timeout
      });

      return response.data;
    } catch (error) {
      this.logger.error('Scrape.do request failed', error, { targetUrl });
      throw error;
    }
  }

  async scrapeListings(url) {
    try {
      this.logger.info('Starting MercadoLibre scraping via Scrape.do', { url });
      
      const html = await this.scrapeWithScrapeDo(url);
      const $ = cheerio.load(html);
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
    const externalId = idMatch ? `MLM-${idMatch[1]}` : null;
    
    // Skip if no valid ID
    if (!externalId) return null;

    // Extract title
    const title = $el.find('h2.ui-search-item__title, .ui-search-item__group__element .ui-search-item__title').text().trim() || 
                  $el.find('[class*="title"]').first().text().trim() || 
                  'Sin título';

    // Extract price
    const priceContainer = $el.find('.andes-money-amount, .price-tag').first();
    const priceText = priceContainer.find('.andes-money-amount__fraction, .price-tag-fraction').first().text().trim() || '0';
    const priceMatch = priceText.match(/[\d,]+/);
    const priceValue = priceMatch ? parseFloat(priceMatch[0].replace(/,/g, '')) : 0;
    
    // Extract currency
    const currency = priceContainer.find('.andes-money-amount__currency-symbol').text().trim() || 'MXN';

    // Extract location
    const locationText = $el.find('.ui-search-item__location, .ui-search-item__group__element:contains("Col."), .ui-search-item__group__element:contains(",")').text().trim() ||
                     $el.find('[class*="location"]').text().trim() || 
                     'México';

    // Parse location into components
    const locationParts = this.parseLocation(locationText);

    // Extract attributes
    const attributes = [];
    const attributeSelectors = [
      '.poly-attributes_list__item',
      '.ui-search-card-attributes__attribute',
      '.ui-search-attributes__attribute',
      '.ui-search-item__group__element span',
      '[class*="attribute"] span'
    ];
    
    for (const selector of attributeSelectors) {
      const elements = $el.find(selector);
      if (elements.length > 0) {
        elements.each((i, attr) => {
          const text = $(attr).text().trim();
          if (text && text.match(/\d+/)) {
            attributes.push(text);
          }
        });
        break;
      }
    }

    // Parse attributes
    let bedrooms = 0;
    let bathrooms = 0;
    let size = "0";

    attributes.forEach(attr => {
      // Size parsing
      const sizeMatch = attr.match(/(\d+)(?:\s*[-a]\s*(\d+))?\s*m[²2]/i);
      if (sizeMatch) {
        if (sizeMatch[2]) {
          size = String(Math.round((parseInt(sizeMatch[1]) + parseInt(sizeMatch[2])) / 2));
        } else {
          size = sizeMatch[1];
        }
      }

      // Bedrooms
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
    let propertyType = 'Casa';
    if (titleLower.includes('departamento') || titleLower.includes('depto')) {
      propertyType = 'Departamento';
    } else if (titleLower.includes('terreno')) {
      propertyType = 'Terreno';
    } else if (titleLower.includes('local')) {
      propertyType = 'Local';
    } else if (titleLower.includes('oficina')) {
      propertyType = 'Oficina';
    }

    const description = `${title} - ${locationText}`;

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

  parseLocation(location) {
    const parts = location.split(',').map(p => p.trim());
    
    let city = '';
    let state = '';

    if (parts.length >= 2) {
      state = parts[parts.length - 1];
      
      const stateMap = {
        'Estado De México': 'Estado de México',
        'Distrito Federal': 'Ciudad de México',
        'Cdmx': 'Ciudad de México',
        'Df': 'Ciudad de México',
        'Edo. De México': 'Estado de México',
        'Edomex': 'Estado de México'
      };
      
      Object.keys(stateMap).forEach(key => {
        if (state.toLowerCase().includes(key.toLowerCase())) {
          state = stateMap[key];
        }
      });
      
      if (parts.length >= 3) {
        city = parts[parts.length - 2];
      } else {
        city = parts[0];
      }
      
      if (city.startsWith('Col.')) {
        city = parts.length > 2 ? parts[parts.length - 3] : city;
      }
    } else if (parts.length === 1) {
      city = parts[0];
      state = 'México';
    }

    return {
      city: city || location,
      state: state || 'México'
    };
  }

  async scrapeThoroughSearch(searchParams = {}) {
    const {
      propertyTypes = ['casas', 'departamentos'],
      operations = ['venta', 'renta'],
      states = ['distrito-federal', 'estado-de-mexico', 'jalisco', 'nuevo-leon'],
      maxPagesPerSearch = 5
    } = searchParams;

    const allListings = [];
    const uniqueIds = new Set();

    for (const operation of operations) {
      for (const propertyType of propertyTypes) {
        for (const state of states) {
          try {
            const baseSearchUrl = `${this.baseUrl}/${propertyType}/${operation}/${state}/`;
            this.logger.info('Searching', { operation, propertyType, state });

            for (let page = 1; page <= maxPagesPerSearch; page++) {
              const offset = (page - 1) * 48;
              const url = `${baseSearchUrl}_Desde_${offset + 1}`;
              
              const listings = await this.scrapeListings(url);
              
              // Add only unique listings
              listings.forEach(listing => {
                if (!uniqueIds.has(listing.external_id)) {
                  uniqueIds.add(listing.external_id);
                  allListings.push(listing);
                }
              });

              if (listings.length === 0) break;

              // Respect rate limits
              await new Promise(resolve => setTimeout(resolve, 2000));
            }
          } catch (error) {
            this.logger.error('Failed to search', error, { 
              operation, propertyType, state 
            });
          }
        }
      }
    }

    this.logger.info('Thorough search completed', { 
      totalUnique: allListings.length 
    });

    return allListings;
  }
}