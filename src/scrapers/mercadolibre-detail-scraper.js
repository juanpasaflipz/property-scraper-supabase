import axios from 'axios';
import * as cheerio from 'cheerio';
import { Logger } from '../utils/logger.js';

export class MercadoLibreDetailScraper {
  constructor() {
    this.logger = new Logger('MercadoLibreDetail');
    this.baseUrl = 'https://inmuebles.mercadolibre.com.mx';
    this.delayBetweenRequests = 2000; // 2 seconds between requests
  }

  async scrapePropertyDetails(url) {
    try {
      // Ensure full URL
      const fullUrl = url.startsWith('http') ? url : `${this.baseUrl}${url}`;
      
      this.logger.info('Scraping property details', { url: fullUrl });
      
      const response = await axios.get(fullUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept-Language': 'es-MX,es;q=0.9,en;q=0.8',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
        },
        timeout: 30000
      });

      const $ = cheerio.load(response.data);
      
      // Extract detailed information
      const details = {
        // Basic info
        title: this.extractTitle($),
        description: this.extractDescription($),
        price: this.extractPrice($),
        
        // Location details
        fullAddress: this.extractFullAddress($),
        neighborhood: this.extractNeighborhood($),
        
        // Property specifications
        totalArea: this.extractTotalArea($),
        builtArea: this.extractBuiltArea($),
        bedrooms: this.extractBedrooms($),
        bathrooms: this.extractBathrooms($),
        parkingSpaces: this.extractParkingSpaces($),
        propertyAge: this.extractPropertyAge($),
        
        // Features and amenities
        amenities: this.extractAmenities($),
        features: this.extractFeatures($),
        
        // Images
        images: this.extractImages($),
        floorPlan: this.extractFloorPlan($),
        
        // Seller info
        sellerType: this.extractSellerType($),
        publishDate: this.extractPublishDate($),
        
        // Additional details
        propertyId: this.extractPropertyId($),
        views: this.extractViews($),
        
        // Raw technical specs
        technicalSpecs: this.extractTechnicalSpecs($)
      };
      
      return details;
      
    } catch (error) {
      this.logger.error('Failed to scrape property details', error);
      throw error;
    }
  }

  extractTitle($) {
    return $('.ui-pdp-title').text().trim() || 
           $('h1.item-title__primary').text().trim() ||
           $('h1').first().text().trim();
  }

  extractDescription($) {
    // MercadoLibre often has description in multiple places
    const description = $('.ui-pdp-description__content').text().trim() ||
                       $('.item-description__text').text().trim() ||
                       $('[class*="description"]').first().text().trim();
    
    return description.substring(0, 5000); // Limit to 5000 chars
  }

  extractPrice($) {
    const priceText = $('.andes-money-amount__fraction').first().text().trim() ||
                     $('.price-tag-fraction').first().text().trim();
    
    const currency = $('.andes-money-amount__currency-symbol').first().text().trim() || 'MXN';
    
    return {
      amount: priceText.replace(/[^\d]/g, ''),
      currency: currency === 'U$S' ? 'USD' : currency,
      formatted: $('.andes-money-amount').first().text().trim()
    };
  }

  extractFullAddress($) {
    // Try multiple selectors for address
    const addressSelectors = [
      '.ui-pdp-media__body',
      '.map-address',
      '.location-info',
      '[class*="address"]'
    ];
    
    for (const selector of addressSelectors) {
      const address = $(selector).text().trim();
      if (address && address.length > 10) {
        return address;
      }
    }
    
    return null;
  }

  extractNeighborhood($) {
    // Look for neighborhood in breadcrumbs or location sections
    const breadcrumb = $('.andes-breadcrumb__item').last().text().trim();
    const locationDetail = $('[class*="location-detail"]').text().trim();
    
    return breadcrumb || locationDetail || null;
  }

  extractTotalArea($) {
    return this.extractAreaByLabel($, ['Superficie total', 'Área total', 'Total']);
  }

  extractBuiltArea($) {
    return this.extractAreaByLabel($, ['Superficie construida', 'Área construida', 'Construidos']);
  }

  extractAreaByLabel($, labels) {
    let area = null;
    
    // Look in technical specs table
    $('.andes-table__row, .specs-item').each((i, el) => {
      const text = $(el).text();
      for (const label of labels) {
        if (text.includes(label)) {
          const match = text.match(/(\d+)\s*m²/);
          if (match) {
            area = match[1];
            return false; // break
          }
        }
      }
    });
    
    return area;
  }

  extractBedrooms($) {
    return this.extractNumberByLabel($, ['Recámaras', 'Habitaciones', 'Dormitorios']);
  }

  extractBathrooms($) {
    return this.extractNumberByLabel($, ['Baños', 'Sanitarios']);
  }

  extractParkingSpaces($) {
    return this.extractNumberByLabel($, ['Estacionamientos', 'Cocheras', 'Parking']);
  }

  extractNumberByLabel($, labels) {
    let number = null;
    
    $('.andes-table__row, .specs-item, .technical-specs li').each((i, el) => {
      const text = $(el).text();
      for (const label of labels) {
        if (text.includes(label)) {
          const match = text.match(/(\d+)/);
          if (match) {
            number = parseInt(match[1]);
            return false; // break
          }
        }
      }
    });
    
    return number;
  }

  extractPropertyAge($) {
    const ageText = this.extractTextByLabel($, ['Antigüedad', 'Años de antigüedad']);
    if (ageText) {
      const match = ageText.match(/(\d+)/);
      return match ? parseInt(match[1]) : null;
    }
    return null;
  }

  extractTextByLabel($, labels) {
    let text = null;
    
    $('.andes-table__row, .specs-item').each((i, el) => {
      const elText = $(el).text();
      for (const label of labels) {
        if (elText.includes(label)) {
          text = elText.replace(label, '').trim();
          return false; // break
        }
      }
    });
    
    return text;
  }

  extractAmenities($) {
    const amenities = [];
    
    // Common amenity selectors
    $('.amenities-item, .ui-pdp-features__item, [class*="amenity"]').each((i, el) => {
      const amenity = $(el).text().trim();
      if (amenity && !amenities.includes(amenity)) {
        amenities.push(amenity);
      }
    });
    
    // Also check for icons with labels
    $('.ui-pdp-media__icon').each((i, el) => {
      const label = $(el).next().text().trim();
      if (label && !amenities.includes(label)) {
        amenities.push(label);
      }
    });
    
    return amenities;
  }

  extractFeatures($) {
    const features = {};
    
    // Extract all technical specifications
    $('.andes-table__row, .ui-pdp-features__item').each((i, el) => {
      const $el = $(el);
      const label = $el.find('.andes-table__header, .ui-pdp-features__label').text().trim();
      const value = $el.find('.andes-table__column--value, .ui-pdp-features__text').text().trim();
      
      if (label && value) {
        features[label] = value;
      }
    });
    
    return features;
  }

  extractImages($) {
    const images = [];
    
    // Main gallery images
    $('.ui-pdp-gallery__figure img, .gallery-image img').each((i, el) => {
      const src = $(el).attr('data-src') || $(el).attr('src');
      if (src && src.startsWith('http')) {
        images.push({
          url: src,
          alt: $(el).attr('alt') || `Image ${i + 1}`
        });
      }
    });
    
    // Thumbnail images as backup
    if (images.length === 0) {
      $('.ui-pdp-thumbnails__item img').each((i, el) => {
        const src = $(el).attr('data-src') || $(el).attr('src');
        if (src && src.startsWith('http')) {
          // Convert thumbnail to full size
          const fullSizeSrc = src.replace(/\-[A-Z]\./, '-F.');
          images.push({
            url: fullSizeSrc,
            alt: `Image ${i + 1}`
          });
        }
      });
    }
    
    return images;
  }

  extractFloorPlan($) {
    // Look for floor plan image
    const floorPlanImg = $('img[alt*="plano"], img[alt*="Plano"], [class*="floor-plan"] img').first();
    if (floorPlanImg.length) {
      return floorPlanImg.attr('src') || floorPlanImg.attr('data-src');
    }
    return null;
  }

  extractSellerType($) {
    const sellerBadge = $('.ui-pdp-seller__badge, .seller-type').text().trim();
    const sellerInfo = $('.ui-pdp-seller__header__info-container').text().trim();
    
    if (sellerBadge.toLowerCase().includes('inmobiliaria') || sellerInfo.toLowerCase().includes('inmobiliaria')) {
      return 'inmobiliaria';
    } else if (sellerBadge.toLowerCase().includes('particular')) {
      return 'particular';
    }
    
    return 'unknown';
  }

  extractPublishDate($) {
    const dateText = $('.ui-pdp-header__subtitle').text().trim();
    const match = dateText.match(/Publicado hace (\d+) (días?|horas?|minutos?)/);
    
    if (match) {
      const number = parseInt(match[1]);
      const unit = match[2];
      
      const date = new Date();
      if (unit.includes('día')) {
        date.setDate(date.getDate() - number);
      } else if (unit.includes('hora')) {
        date.setHours(date.getHours() - number);
      } else if (unit.includes('minuto')) {
        date.setMinutes(date.getMinutes() - number);
      }
      
      return date.toISOString();
    }
    
    return null;
  }

  extractPropertyId($) {
    // Try to get MercadoLibre item ID
    const itemId = $('#itemId').attr('value') ||
                   $('[name="itemId"]').attr('value') ||
                   $('meta[property="og:url"]').attr('content')?.match(/MLM-(\d+)/)?.[0];
    
    return itemId || null;
  }

  extractViews($) {
    const viewsText = $('.ui-pdp-header__subtitle').text();
    const match = viewsText.match(/(\d+)\s*visitas/);
    
    return match ? parseInt(match[1]) : null;
  }

  extractTechnicalSpecs($) {
    const specs = {};
    
    // Extract all data from technical specifications section
    $('.ui-pdp-specs__table, .specs-container').find('.andes-table__row, .spec-row').each((i, el) => {
      const $row = $(el);
      const key = $row.find('.andes-table__header, .spec-label').text().trim();
      const value = $row.find('.andes-table__column--value, .spec-value').text().trim();
      
      if (key && value) {
        specs[key] = value;
      }
    });
    
    return specs;
  }

  async scrapeMultipleProperties(urls, options = {}) {
    const { 
      maxConcurrent = 2,
      delay = 2000,
      onProgress = null,
      onError = null 
    } = options;
    
    const results = [];
    const errors = [];
    
    for (let i = 0; i < urls.length; i++) {
      try {
        const details = await this.scrapePropertyDetails(urls[i]);
        results.push({ url: urls[i], details, success: true });
        
        if (onProgress) {
          onProgress({
            current: i + 1,
            total: urls.length,
            url: urls[i],
            success: true
          });
        }
        
        // Delay between requests
        if (i < urls.length - 1) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        
      } catch (error) {
        const errorInfo = { url: urls[i], error: error.message, success: false };
        errors.push(errorInfo);
        results.push(errorInfo);
        
        if (onError) {
          onError(errorInfo);
        }
        
        this.logger.error('Failed to scrape property', errorInfo);
      }
    }
    
    return { results, errors, success: results.length - errors.length };
  }
}

export default MercadoLibreDetailScraper;