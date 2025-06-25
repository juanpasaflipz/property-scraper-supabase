import axios from 'axios';
import * as cheerio from 'cheerio';
import { Logger } from '../utils/logger.js';

export class MercadoLibreMaximizedScraper {
  constructor() {
    this.logger = new Logger('MercadoLibreMaximized');
    this.baseUrl = 'https://inmuebles.mercadolibre.com.mx';
    this.maxPagesPerSearch = 42; // MercadoLibre's hard limit
    this.delayBetweenRequests = 1000; // 1 second delay
  }

  // Generate all possible search combinations
  generateSearchUrls() {
    const searches = [];

    // Major states/cities in Mexico (using correct MercadoLibre identifiers)
    const locations = [
      { id: 'distrito-federal', name: 'Ciudad de México' },
      { id: 'estado-de-mexico', name: 'Estado de México' },
      { id: 'jalisco', name: 'Jalisco' },
      { id: 'nuevo-leon', name: 'Nuevo León' },
      { id: 'puebla', name: 'Puebla' },
      { id: 'queretaro', name: 'Querétaro' },
      { id: 'guanajuato', name: 'Guanajuato' },
      { id: 'yucatan', name: 'Yucatán' },
      { id: 'quintana-roo', name: 'Quintana Roo' },
      { id: 'veracruz', name: 'Veracruz' },
      { id: 'chihuahua', name: 'Chihuahua' },
      { id: 'coahuila', name: 'Coahuila' },
      { id: 'tamaulipas', name: 'Tamaulipas' },
      { id: 'baja-california', name: 'Baja California' },
      { id: 'sinaloa', name: 'Sinaloa' },
      { id: 'sonora', name: 'Sonora' },
      { id: 'san-luis-potosi', name: 'San Luis Potosí' },
      { id: 'aguascalientes', name: 'Aguascalientes' },
      { id: 'morelos', name: 'Morelos' },
      { id: 'hidalgo', name: 'Hidalgo' }
    ];

    // Property types
    const propertyTypes = [
      { id: 'casas', name: 'Casas' },
      { id: 'departamentos', name: 'Departamentos' },
      { id: 'terrenos', name: 'Terrenos' },
      { id: 'locales', name: 'Locales Comerciales' },
      { id: 'oficinas', name: 'Oficinas' },
      { id: 'bodegas', name: 'Bodegas' }
    ];

    // Operations
    const operations = [
      { id: 'venta', name: 'Venta' },
      { id: 'renta', name: 'Renta' }
    ];

    // Price ranges for sale (in MXN)
    const salePriceRanges = [
      { min: 0, max: 500000, label: '0-500k' },
      { min: 500000, max: 1000000, label: '500k-1M' },
      { min: 1000000, max: 1500000, label: '1M-1.5M' },
      { min: 1500000, max: 2000000, label: '1.5M-2M' },
      { min: 2000000, max: 3000000, label: '2M-3M' },
      { min: 3000000, max: 5000000, label: '3M-5M' },
      { min: 5000000, max: 10000000, label: '5M-10M' },
      { min: 10000000, max: 20000000, label: '10M-20M' }
    ];

    // Price ranges for rent (in MXN)
    const rentPriceRanges = [
      { min: 0, max: 5000, label: '0-5k' },
      { min: 5000, max: 10000, label: '5k-10k' },
      { min: 10000, max: 15000, label: '10k-15k' },
      { min: 15000, max: 20000, label: '15k-20k' },
      { min: 20000, max: 30000, label: '20k-30k' },
      { min: 30000, max: 50000, label: '30k-50k' },
      { min: 50000, max: 100000, label: '50k-100k' }
    ];

    // 1. Basic searches without location (nationwide)
    propertyTypes.forEach(propertyType => {
      operations.forEach(operation => {
        searches.push({
          url: `/${propertyType.id}/${operation.id}/`,
          params: {
            propertyType: propertyType.id,
            operation: operation.id,
            description: `${propertyType.name} en ${operation.name} - Nacional`
          }
        });
      });
    });

    // 2. Location + Property Type + Operation
    locations.forEach(location => {
      propertyTypes.forEach(propertyType => {
        operations.forEach(operation => {
          searches.push({
            url: `/${propertyType.id}/${operation.id}/${location.id}/`,
            params: {
              location: location.id,
              locationName: location.name,
              propertyType: propertyType.id,
              operation: operation.id,
              description: `${propertyType.name} en ${operation.name} - ${location.name}`
            }
          });
        });
      });
    });

    // 3. Price range searches (without location for broader coverage)
    operations.forEach(operation => {
      const priceRanges = operation.id === 'venta' ? salePriceRanges : rentPriceRanges;
      
      priceRanges.forEach(priceRange => {
        propertyTypes.forEach(propertyType => {
          searches.push({
            url: `/${propertyType.id}/${operation.id}/_PriceRange_${priceRange.min}-${priceRange.max}`,
            params: {
              propertyType: propertyType.id,
              operation: operation.id,
              priceMin: priceRange.min,
              priceMax: priceRange.max,
              priceRange: priceRange.label,
              description: `${propertyType.name} en ${operation.name} - ${priceRange.label}`
            }
          });
        });
      });
    });

    // 4. Bedroom searches for houses and apartments
    const bedroomOptions = [
      { bedrooms: 1, label: '1 recámara' },
      { bedrooms: 2, label: '2 recámaras' },
      { bedrooms: 3, label: '3 recámaras' },
      { bedrooms: 4, label: '4+ recámaras' }
    ];

    ['casas', 'departamentos'].forEach(propertyType => {
      operations.forEach(operation => {
        bedroomOptions.forEach(bedroom => {
          searches.push({
            url: `/${propertyType}/${operation.id}/_BEDROOMS_${bedroom.bedrooms}`,
            params: {
              propertyType: propertyType,
              operation: operation.id,
              bedrooms: bedroom.bedrooms,
              description: `${propertyType === 'casas' ? 'Casas' : 'Departamentos'} en ${operation.name} - ${bedroom.label}`
            }
          });
        });
      });
    });

    // 5. Combined searches: Location + Price Range  
    const topLocations = locations.slice(0, 10); // Focus on top 10 states
    topLocations.forEach(location => {
      // Add some price range searches for top locations
      searches.push({
        url: `/casas/${location.id}/_PriceRange_0-2000000`,
        params: {
          location: location.id,
          description: `Casas económicas en ${location.name} (0-2M)`
        }
      });
      
      searches.push({
        url: `/departamentos/renta/${location.id}/_PriceRange_5000-20000`,
        params: {
          location: location.id,
          description: `Departamentos en renta en ${location.name} (5k-20k)`
        }
      });
    });

    // 6. Area-based searches
    const areaRanges = [
      { min: 0, max: 100, label: '0-100m²' },
      { min: 100, max: 200, label: '100-200m²' },
      { min: 200, max: 500, label: '200-500m²' },
      { min: 500, max: 1000, label: '500-1000m²' }
    ];

    // Add some area-based searches
    areaRanges.forEach(area => {
      searches.push({
        url: `/casas/venta/_AREA_${area.min}-${area.max}`,
        params: {
          areaMin: area.min,
          areaMax: area.max,
          description: `Casas en venta por tamaño ${area.label}`
        }
      });
    });

    // 7. Special categories
    const specialSearches = [
      { url: '/casas/venta/_CONSTRUCTION_new', desc: 'Casas nuevas en venta' },
      { url: '/departamentos/venta/_CONSTRUCTION_new', desc: 'Departamentos nuevos en venta' },
      { url: '/casas/venta/_AMENITIES_pool', desc: 'Casas con alberca' },
      { url: '/departamentos/_AMENITIES_gym', desc: 'Departamentos con gimnasio' },
      { url: '/casas/venta/_AMENITIES_security', desc: 'Casas con seguridad' }
    ];

    specialSearches.forEach(special => {
      searches.push({
        url: special.url,
        params: {
          description: special.desc
        }
      });
    });

    return searches;
  }

  async scrapeUrl(url, pageLimit = this.maxPagesPerSearch) {
    const allListings = [];
    const seenIds = new Set();

    for (let page = 1; page <= pageLimit; page++) {
      try {
        const offset = (page - 1) * 48;
        const pageUrl = `${this.baseUrl}${url}${url.includes('?') ? '&' : '?'}_Desde_${offset + 1}`;
        
        this.logger.info(`Scraping page ${page}/${pageLimit}`, { url: pageUrl });
        
        // Add delay between requests to avoid rate limiting
        if (page > 1) {
          await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 1000));
        }
        
        const response = await axios.get(pageUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'es-MX,es;q=0.9,en;q=0.8',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"macOS"',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1'
          },
          timeout: 45000,
          maxRedirects: 5,
          validateStatus: (status) => status < 500
        });

        // Check for 400 errors
        if (response.status === 400) {
          this.logger.warn(`Received 400 error, may be rate limited. Waiting longer...`);
          await new Promise(resolve => setTimeout(resolve, 10000 + Math.random() * 5000));
          continue;
        }
        
        const $ = cheerio.load(response.data);
        const listings = this.extractListings($);
        
        if (listings.length === 0) {
          this.logger.info(`No more listings found at page ${page}`);
          break;
        }

        // Deduplicate within this search
        const newListings = listings.filter(listing => {
          if (seenIds.has(listing.external_id)) {
            return false;
          }
          seenIds.add(listing.external_id);
          return true;
        });

        allListings.push(...newListings);
        
        // Respect rate limits
        if (page < pageLimit) {
          await new Promise(resolve => setTimeout(resolve, this.delayBetweenRequests));
        }
      } catch (error) {
        this.logger.error(`Failed to scrape page ${page}`, error);
        
        // If we get too many errors in a row, add a longer delay
        if (error.response?.status === 400 || error.code === 'ETIMEDOUT') {
          this.logger.warn(`Rate limit or timeout detected, waiting 15 seconds...`);
          await new Promise(resolve => setTimeout(resolve, 15000));
        }
        
        // Continue with next page instead of stopping
      }
    }

    return allListings;
  }

  extractListings($) {
    const listings = [];
    
    $('.ui-search-layout__item').each((index, element) => {
      try {
        const listing = this.extractListing($, element);
        if (listing) {
          listings.push(listing);
        }
      } catch (error) {
        this.logger.error('Failed to extract listing', error);
      }
    });

    return listings;
  }

  extractListing($, element) {
    const $el = $(element);
    
    // Extract URL and ID
    const link = $el.find('a.ui-search-result__link').attr('href') || 
                 $el.find('a.ui-search-link').attr('href') || 
                 $el.find('a').first().attr('href') || '';
    
    const idMatch = link.match(/MLM-(\d+)/);
    const external_id = idMatch ? `MLM-${idMatch[1]}` : `MLM-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Extract title - MercadoLibre stores it in the image title
    const title = $el.find('img[title]').first().attr('title') || 
                  $el.find('h2.ui-search-item__title').text().trim() || 
                  $el.find('.ui-search-item__title').text().trim() || 
                  $el.find('[class*="title"]').first().text().trim() || 
                  'Sin título';

    // Skip if no title found
    if (title === 'Sin título' || !title) return null;

    // Extract price
    const priceText = $el.find('.andes-money-amount__fraction').first().text().trim() || 
                      $el.find('.price-tag-fraction').first().text().trim() || '0';
    const price = priceText.replace(/[^\d]/g, '');
    
    const currencySymbol = $el.find('.andes-money-amount__currency-symbol').first().text().trim();
    const currency = currencySymbol === 'U$S' ? 'USD' : 'MXN';

    // Extract location
    const location = $el.find('.ui-search-item__location').text().trim() || 
                     $el.find('[class*="location"]').text().trim() || '';
    const locationParts = location.split(',').map(p => p.trim());
    const city = locationParts.length > 1 ? locationParts[locationParts.length - 2] : locationParts[0] || '';
    const state = locationParts.length > 0 ? locationParts[locationParts.length - 1] : '';

    // Extract attributes with multiple selectors
    let bedrooms = 0;
    let bathrooms = 0;
    let size = '';

    const attributeSelectors = [
      '.poly-attributes_list__item',
      '.ui-search-item__group__element span',
      '.ui-search-card-attributes__attribute',
      '[class*="attribute"] span'
    ];

    attributeSelectors.forEach(selector => {
      $el.find(selector).each((i, attr) => {
        const text = $(attr).text().trim().toLowerCase();
        
        if ((text.includes('recámara') || text.includes('dormitorio') || text.includes('habitación')) && bedrooms === 0) {
          const match = text.match(/(\d+)/);
          if (match) bedrooms = parseInt(match[1]);
        } else if (text.includes('baño') && bathrooms === 0) {
          const match = text.match(/(\d+)/);
          if (match) bathrooms = parseInt(match[1]);
        } else if ((text.includes('m²') || text.includes('m2')) && !size) {
          const sizeMatch = text.match(/(\d+)(?:\s*[-a]\s*(\d+))?/);
          if (sizeMatch) {
            if (sizeMatch[2]) {
              // Range: take average
              size = String(Math.round((parseInt(sizeMatch[1]) + parseInt(sizeMatch[2])) / 2));
            } else {
              size = sizeMatch[1];
            }
          }
        }
      });
    });

    // Extract image
    const image_url = $el.find('img[src]').first().attr('src') || 
                      $el.find('img[data-src]').first().attr('data-src') || '';

    // Determine property type
    let property_type = 'Otro';
    const titleLower = title.toLowerCase();
    if (titleLower.includes('casa')) property_type = 'Casa';
    else if (titleLower.includes('departamento') || titleLower.includes('depto')) property_type = 'Departamento';
    else if (titleLower.includes('terreno')) property_type = 'Terreno';
    else if (titleLower.includes('local')) property_type = 'Local';
    else if (titleLower.includes('oficina')) property_type = 'Oficina';
    else if (titleLower.includes('bodega')) property_type = 'Bodega';

    return {
      external_id,
      title,
      price,
      currency,
      location,
      city,
      state,
      country: 'México',
      bedrooms,
      bathrooms,
      size,
      property_type,
      link,
      description: '',
      image_url,
      source: 'mercadolibre'
    };
  }

  async scrapeWithMaximization(options = {}) {
    const {
      maxSearches = 50, // Limit number of searches to avoid too long execution
      shuffleSearches = true,
      progressCallback = null
    } = options;

    const allListings = new Map(); // Use Map to deduplicate by external_id
    const searchUrls = this.generateSearchUrls();
    
    // Shuffle searches to get variety if limited
    if (shuffleSearches) {
      for (let i = searchUrls.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [searchUrls[i], searchUrls[j]] = [searchUrls[j], searchUrls[i]];
      }
    }

    const searchesToRun = searchUrls.slice(0, maxSearches);
    this.logger.info(`Running ${searchesToRun.length} searches out of ${searchUrls.length} possible combinations`);

    for (let i = 0; i < searchesToRun.length; i++) {
      const search = searchesToRun[i];
      
      try {
        this.logger.info(`Search ${i + 1}/${searchesToRun.length}: ${search.params.description}`);
        
        if (progressCallback) {
          progressCallback({
            current: i + 1,
            total: searchesToRun.length,
            description: search.params.description,
            listingsFound: allListings.size
          });
        }

        const listings = await this.scrapeUrl(search.url, 5); // Limit to 5 pages per search for speed
        
        // Add search metadata to each listing
        listings.forEach(listing => {
          listing.search_metadata = search.params;
          allListings.set(listing.external_id, listing);
        });

        this.logger.info(`Found ${listings.length} listings (${allListings.size} total unique)`);
        
        // Longer delay between different searches
        if (i < searchesToRun.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } catch (error) {
        this.logger.error(`Failed search: ${search.params.description}`, error);
      }
    }

    return Array.from(allListings.values());
  }
}

export default MercadoLibreMaximizedScraper;