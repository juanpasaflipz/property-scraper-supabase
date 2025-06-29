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

const logger = new Logger('BR23Scraper');

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// BR23 scraper configuration
const BR23_CONFIG = {
  baseUrl: 'https://br23.mx',
  salesUrl: 'https://br23.mx/propiedades/todas/venta',
  rentalsUrl: 'https://br23.mx/propiedades/todas/rentas',
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'es-MX,es;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1'
  },
  timeout: 30000,
  retryDelay: 2000,
  maxRetries: 3
};

// Utility functions
function extractPrice(priceText) {
  if (!priceText) return null;
  
  // Remove currency symbols and clean the text
  const cleaned = priceText.replace(/[^0-9.,]/g, '');
  const price = parseFloat(cleaned.replace(/,/g, ''));
  
  return isNaN(price) ? null : price;
}

function extractNumber(text) {
  if (!text) return null;
  const match = text.match(/\d+/);
  return match ? parseInt(match[0]) : null;
}

function extractArea(areaText) {
  if (!areaText) return null;
  const match = areaText.match(/(\d+(?:\.\d+)?)\s*m/);
  return match ? parseFloat(match[1]) : null;
}

// Scrape listing page
async function scrapeListingPage(url, operation, page = 1) {
  const pageUrl = `${url}?page=${page}`;
  logger.info('Scraping BR23 listing page', { url: pageUrl, operation, page });

  try {
    const response = await axios.get(pageUrl, {
      headers: BR23_CONFIG.headers,
      timeout: BR23_CONFIG.timeout
    });

    const $ = cheerio.load(response.data);
    const properties = [];

    // Find all property cards
    $('.property-item').each((index, element) => {
      try {
        const $card = $(element);
        
        // Extract basic information
        const id = $card.attr('data-id');
        const propertyType = $card.attr('data-type');
        
        // Get the property link and title
        const $titleLink = $card.find('h5 a');
        const title = $titleLink.text().trim();
        const relativeUrl = $titleLink.attr('href');
        const url = relativeUrl ? `${BR23_CONFIG.baseUrl}${relativeUrl}` : null;
        
        // Extract image
        const imageUrl = $card.find('.image-container img').attr('src');
        
        // Extract description
        const description = $card.find('.description small').text().trim();
        
        // Extract features
        const features = [];
        $card.find('.details ul li').each((i, el) => {
          features.push($(el).text().trim());
        });
        
        // Parse features to extract bedrooms, bathrooms, and area
        let bedrooms = null;
        let bathrooms = null;
        let area = null;
        
        features.forEach(feature => {
          if (feature.includes('Dormitorio')) {
            bedrooms = extractNumber(feature);
          } else if (feature.includes('Baño')) {
            bathrooms = extractNumber(feature);
          } else if (feature.includes('m2 Totales') || feature.includes('m²')) {
            area = extractArea(feature);
          }
        });
        
        // Extract location info
        const address = $card.find('.address-to-show').text().trim();
        
        // Price extraction - BR23 loads prices dynamically, so we'll need to fetch detail page
        // For now, we'll set as null and update during detail scraping
        const price = null;
        
        if (id && title) {
          properties.push({
            external_id: `br23_${id}`,
            title,
            price,
            currency: 'MXN',
            location: address || title,
            city: null, // Will be extracted from detail page
            state: null, // Will be extracted from detail page
            country: 'México',
            bedrooms,
            bathrooms,
            size: area ? `${area} m²` : null,
            area_sqm: area,
            property_type: propertyType,
            link: url,
            description,
            image_url: imageUrl,
            source: 'br23',
            listing_date: new Date(),
            last_updated: new Date(),
            operation_type: operation,
            raw_data: {
              id,
              features,
              propertyType,
              tags: $card.attr('data-tags')
            }
          });
        }
      } catch (error) {
        logger.error('Error parsing property card', error, { index });
      }
    });

    // Check if there are more pages
    const hasNextPage = $('.pagination .page-item:last-child').hasClass('disabled') === false;

    logger.info('Scraped BR23 listing page', { 
      url: pageUrl, 
      operation, 
      page, 
      propertiesFound: properties.length,
      hasNextPage 
    });

    return { properties, hasNextPage };
  } catch (error) {
    logger.error('Error scraping BR23 listing page', error, { url: pageUrl, operation, page });
    throw error;
  }
}

// Scrape property detail page
async function scrapePropertyDetail(url) {
  logger.info('Scraping BR23 property detail', { url });

  try {
    const response = await axios.get(url, {
      headers: BR23_CONFIG.headers,
      timeout: BR23_CONFIG.timeout
    });

    const $ = cheerio.load(response.data);
    const details = {};

    // Extract price
    const priceText = $('.price-container .price, .property-price, .precio').text().trim();
    details.price = extractPrice(priceText);

    // Extract detailed location
    details.full_address = $('.property-address, .direccion, .ubicacion').text().trim();
    
    // Extract neighborhood, city, state from breadcrumb or location info
    const locationParts = [];
    $('.breadcrumb li, .location-breadcrumb li').each((i, el) => {
      const text = $(el).text().trim();
      if (text && !text.includes('Inicio') && !text.includes('Propiedades')) {
        locationParts.push(text);
      }
    });

    if (locationParts.length > 0) {
      details.neighborhood = locationParts[0];
      details.city = locationParts[1] || null;
      details.state = locationParts[2] || null;
    }

    // Extract amenities
    const amenities = [];
    $('.amenities li, .amenidades li, .features li').each((i, el) => {
      const amenity = $(el).text().trim();
      if (amenity) amenities.push(amenity);
    });
    if (amenities.length > 0) details.amenities = amenities;

    // Extract additional features
    const features = {};
    $('.property-features .feature-item, .caracteristicas .item').each((i, el) => {
      const $item = $(el);
      const key = $item.find('.feature-label, .label').text().trim();
      const value = $item.find('.feature-value, .value').text().trim();
      if (key && value) {
        features[key] = value;
      }
    });
    if (Object.keys(features).length > 0) details.features = features;

    // Extract images
    const images = [];
    $('.property-gallery img, .galeria img, .carousel img').each((i, el) => {
      const src = $(el).attr('src') || $(el).attr('data-src');
      if (src && !src.includes('placeholder')) {
        images.push(src);
      }
    });
    if (images.length > 0) details.images = images;

    // Extract technical specifications
    const technicalSpecs = {};
    $('.technical-specs .spec-item, .especificaciones .item').each((i, el) => {
      const $item = $(el);
      const key = $item.find('.spec-label').text().trim();
      const value = $item.find('.spec-value').text().trim();
      if (key && value) {
        technicalSpecs[key] = value;
      }
    });
    if (Object.keys(technicalSpecs).length > 0) details.technical_specs = technicalSpecs;

    // Extract parking spaces
    const parkingText = $('.parking, .estacionamiento').text();
    details.parking_spaces = extractNumber(parkingText);

    // Extract property age
    const ageText = $('.property-age, .antiguedad').text();
    details.property_age = extractNumber(ageText);

    // Extract seller type
    details.seller_type = $('.seller-type, .tipo-vendedor, .inmobiliaria').text().trim() || null;

    logger.info('Scraped BR23 property detail', { url, details });
    return details;
  } catch (error) {
    logger.error('Error scraping BR23 property detail', error, { url });
    return {};
  }
}

// Save property to database
async function saveProperty(property) {
  const client = await pool.connect();
  
  try {
    // Check if property already exists
    const checkQuery = `
      SELECT id, detail_scraped FROM properties 
      WHERE external_id = $1
    `;
    const checkResult = await client.query(checkQuery, [property.external_id]);
    
    if (checkResult.rows.length > 0) {
      // Update existing property
      const updateQuery = `
        UPDATE properties SET
          title = $2,
          price = $3,
          currency = $4,
          location = $5,
          city = $6,
          state = $7,
          country = $8,
          bedrooms = $9,
          bathrooms = $10,
          size = $11,
          area_sqm = $12,
          property_type = $13,
          link = $14,
          description = $15,
          image_url = $16,
          last_updated = $17,
          last_seen_at = $17,
          raw_data = $18,
          full_address = $19,
          neighborhood = $20,
          amenities = $21,
          features = $22,
          images = $23,
          technical_specs = $24,
          parking_spaces = $25,
          property_age = $26,
          seller_type = $27,
          detail_scraped = $28
        WHERE external_id = $1
        RETURNING id
      `;
      
      const values = [
        property.external_id,
        property.title,
        property.price,
        property.currency,
        property.location,
        property.city,
        property.state,
        property.country,
        property.bedrooms,
        property.bathrooms,
        property.size,
        property.area_sqm,
        property.property_type,
        property.link,
        property.description,
        property.image_url,
        property.last_updated,
        property.raw_data,
        property.full_address || null,
        property.neighborhood || null,
        property.amenities ? JSON.stringify(property.amenities) : null,
        property.features ? JSON.stringify(property.features) : null,
        property.images ? JSON.stringify(property.images) : null,
        property.technical_specs ? JSON.stringify(property.technical_specs) : null,
        property.parking_spaces || null,
        property.property_age || null,
        property.seller_type || null,
        property.detail_scraped || false
      ];
      
      const result = await client.query(updateQuery, values);
      logger.debug('Updated property', { id: result.rows[0].id, external_id: property.external_id });
      return result.rows[0].id;
    } else {
      // Insert new property
      const insertQuery = `
        INSERT INTO properties (
          external_id, title, price, currency, location, city, state, country,
          bedrooms, bathrooms, size, area_sqm, property_type, link, description,
          image_url, source, listing_date, last_updated, last_seen_at, raw_data,
          full_address, neighborhood, amenities, features, images, technical_specs,
          parking_spaces, property_age, seller_type, detail_scraped
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
          $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31
        ) RETURNING id
      `;
      
      const values = [
        property.external_id,
        property.title,
        property.price,
        property.currency,
        property.location,
        property.city,
        property.state,
        property.country,
        property.bedrooms,
        property.bathrooms,
        property.size,
        property.area_sqm,
        property.property_type,
        property.link,
        property.description,
        property.image_url,
        property.source,
        property.listing_date,
        property.last_updated,
        property.last_updated, // last_seen_at
        property.raw_data,
        property.full_address || null,
        property.neighborhood || null,
        property.amenities ? JSON.stringify(property.amenities) : null,
        property.features ? JSON.stringify(property.features) : null,
        property.images ? JSON.stringify(property.images) : null,
        property.technical_specs ? JSON.stringify(property.technical_specs) : null,
        property.parking_spaces || null,
        property.property_age || null,
        property.seller_type || null,
        property.detail_scraped || false
      ];
      
      const result = await client.query(insertQuery, values);
      logger.debug('Inserted new property', { id: result.rows[0].id, external_id: property.external_id });
      return result.rows[0].id;
    }
  } finally {
    client.release();
  }
}

// Main scraping function
async function scrapeBR23(operation = 'all', maxPages = 5, scrapeDetails = true) {
  logger.info('Starting BR23 scraper', { operation, maxPages, scrapeDetails });
  
  const urls = [];
  if (operation === 'all' || operation === 'venta') {
    urls.push({ url: BR23_CONFIG.salesUrl, operation: 'venta' });
  }
  if (operation === 'all' || operation === 'renta') {
    urls.push({ url: BR23_CONFIG.rentalsUrl, operation: 'renta' });
  }
  
  const results = {
    total: 0,
    saved: 0,
    errors: 0,
    byOperation: {}
  };
  
  for (const { url, operation: op } of urls) {
    results.byOperation[op] = { total: 0, saved: 0, errors: 0 };
    
    for (let page = 1; page <= maxPages; page++) {
      try {
        const { properties, hasNextPage } = await scrapeListingPage(url, op, page);
        results.byOperation[op].total += properties.length;
        
        for (const property of properties) {
          try {
            // Scrape detail page if enabled and URL exists
            if (scrapeDetails && property.link) {
              await new Promise(resolve => setTimeout(resolve, 1000)); // Rate limiting
              const details = await scrapePropertyDetail(property.link);
              Object.assign(property, details);
              property.detail_scraped = true;
            }
            
            await saveProperty(property);
            results.byOperation[op].saved++;
          } catch (error) {
            logger.error('Error saving property', error, { external_id: property.external_id });
            results.byOperation[op].errors++;
          }
        }
        
        if (!hasNextPage) {
          logger.info('No more pages', { operation: op, lastPage: page });
          break;
        }
        
        // Rate limiting between pages
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        logger.error('Error scraping page', error, { operation: op, page });
        results.byOperation[op].errors++;
      }
    }
    
    results.total += results.byOperation[op].total;
    results.saved += results.byOperation[op].saved;
    results.errors += results.byOperation[op].errors;
  }
  
  logger.info('BR23 scraping completed', results);
  return results;
}

// Export functions
export { scrapeBR23, scrapeListingPage, scrapePropertyDetail };

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const operation = process.argv[2] || 'all'; // 'venta', 'renta', or 'all'
  const maxPages = parseInt(process.argv[3]) || 5;
  const scrapeDetails = process.argv[4] !== 'false';
  
  scrapeBR23(operation, maxPages, scrapeDetails)
    .then(results => {
      console.log('Scraping completed:', results);
      process.exit(0);
    })
    .catch(error => {
      console.error('Scraping failed:', error);
      process.exit(1);
    });
}