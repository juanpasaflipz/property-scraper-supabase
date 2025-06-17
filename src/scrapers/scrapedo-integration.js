import axios from 'axios';
import fs from 'fs/promises';
import { Logger } from '../utils/logger.js';

export class ScrapeDoIntegration {
  constructor() {
    this.logger = new Logger('ScrapeDoIntegration');
    this.apiUrl = process.env.SCRAPEDO_API_URL || 'https://api.scrape.do';
    this.token = process.env.SCRAPEDO_TOKEN;
  }

  async fetchFromAPI(targetUrl) {
    if (!this.token) {
      this.logger.error('SCRAPEDO_TOKEN not configured');
      throw new Error('Scrape.do token is required');
    }

    try {
      this.logger.info('Fetching from Scrape.do API', { targetUrl });
      
      const response = await axios.get(this.apiUrl, {
        params: {
          token: this.token,
          url: targetUrl,
          render: true, // Enable JavaScript rendering
          premium: true // Use premium proxies
        }
      });

      return response.data;
    } catch (error) {
      this.logger.error('Failed to fetch from Scrape.do', error, { targetUrl });
      throw error;
    }
  }

  async loadFromFile(filePath = './listings.json') {
    try {
      this.logger.info('Loading listings from file', { filePath });
      const data = await fs.readFile(filePath, 'utf-8');
      const listings = JSON.parse(data);
      
      // Normalize the data to match our schema
      return this.normalizeListings(listings);
    } catch (error) {
      this.logger.error('Failed to load listings from file', error, { filePath });
      // Return empty array if file doesn't exist
      if (error.code === 'ENOENT') {
        this.logger.info('Listings file not found, returning empty array');
        return [];
      }
      throw error;
    }
  }

  normalizeListings(listings) {
    if (!Array.isArray(listings)) {
      this.logger.error('Invalid listings format, expected array');
      return [];
    }

    return listings.map((listing, index) => {
      try {
        // Handle different possible field names
        const normalized = {
          id: listing.id || listing.external_id || `SD${Date.now()}-${index}`,
          title: listing.title || listing.name || listing.headline || 'Sin título',
          price: this.parsePrice(listing.price || listing.precio || listing.cost),
          address: listing.address || listing.location || listing.direccion || 'Sin dirección',
          bedrooms: this.parseNumber(listing.bedrooms || listing.recamaras || listing.habitaciones),
          bathrooms: this.parseNumber(listing.bathrooms || listing.banos),
          area_sqm: this.parseNumber(listing.area_sqm || listing.area || listing.superficie),
          source: listing.source || 'scrapedo',
          url: listing.url || listing.link || '',
          property_type: listing.property_type || listing.tipo || 'Inmueble',
          raw_data: listing // Keep original data for reference
        };

        return normalized;
      } catch (error) {
        this.logger.error('Failed to normalize listing', error, { index, listing });
        return null;
      }
    }).filter(Boolean); // Remove any null entries
  }

  parsePrice(value) {
    if (!value) return 0;
    
    // Handle string prices with currency symbols and commas
    if (typeof value === 'string') {
      const cleaned = value.replace(/[$,]/g, '').trim();
      const parsed = parseFloat(cleaned);
      return isNaN(parsed) ? 0 : parsed;
    }
    
    return typeof value === 'number' ? value : 0;
  }

  parseNumber(value) {
    if (!value) return null;
    
    // Handle string numbers
    if (typeof value === 'string') {
      const parsed = parseInt(value);
      return isNaN(parsed) ? null : parsed;
    }
    
    return typeof value === 'number' ? value : null;
  }

  async fetchAndNormalize(targetUrl) {
    const rawData = await this.fetchFromAPI(targetUrl);
    
    // Assume the API returns JSON with listings array
    let listings = [];
    if (rawData.listings) {
      listings = rawData.listings;
    } else if (rawData.results) {
      listings = rawData.results;
    } else if (Array.isArray(rawData)) {
      listings = rawData;
    }
    
    return this.normalizeListings(listings);
  }
}