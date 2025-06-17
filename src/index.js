import dotenv from 'dotenv';
import { Database } from './db/database.js';
import { PropertyRepository } from './db/property-repository.js';
import { MercadoLibreScraper } from './scrapers/mercadolibre-scraper.js';
import { ScrapeDoIntegration } from './scrapers/scrapedo-integration.js';
import { Logger } from './utils/logger.js';

dotenv.config();

const logger = new Logger('Main');

class PropertyScraperApp {
  constructor() {
    this.db = new Database();
    this.repository = null;
    this.mercadolibreScraper = new MercadoLibreScraper();
    this.scrapeDoIntegration = new ScrapeDoIntegration();
  }

  async initialize() {
    try {
      logger.info('Initializing Property Scraper Application');
      await this.db.connect();
      this.repository = new PropertyRepository(this.db);
      logger.info('Application initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize application', error);
      throw error;
    }
  }

  async scrapeAndStore(options = {}) {
    const {
      mercadolibreUrl = 'https://inmuebles.mercadolibre.com.mx/casas/venta/',
      maxPages = 3,
      includeScrapeDo = true,
      scrapeDoFile = './listings.json'
    } = options;

    try {
      const allListings = [];
      
      // 1. Scrape MercadoLibre
      logger.info('Starting MercadoLibre scraping', { url: mercadolibreUrl, maxPages });
      const mercadolibreListings = await this.mercadolibreScraper.scrapeMultiplePages(
        mercadolibreUrl, 
        maxPages
      );
      allListings.push(...mercadolibreListings);
      logger.info('MercadoLibre scraping completed', { 
        count: mercadolibreListings.length 
      });

      // 2. Load Scrape.do data if requested
      if (includeScrapeDo) {
        logger.info('Loading Scrape.do data', { file: scrapeDoFile });
        const scrapeDoListings = await this.scrapeDoIntegration.loadFromFile(scrapeDoFile);
        allListings.push(...scrapeDoListings);
        logger.info('Scrape.do data loaded', { 
          count: scrapeDoListings.length 
        });
      }

      // 3. Remove duplicates based on ID
      const uniqueListings = this.deduplicateListings(allListings);
      logger.info('Deduplication completed', {
        original: allListings.length,
        unique: uniqueListings.length,
        duplicates: allListings.length - uniqueListings.length
      });

      // 4. Upsert to database
      logger.info('Starting database upsert', { count: uniqueListings.length });
      const results = await this.repository.upsertProperties(uniqueListings);
      
      // 5. Return summary
      const summary = {
        total_processed: uniqueListings.length,
        inserted: results.inserted,
        updated: results.updated,
        errors: results.errors.length,
        error_details: results.errors,
        sources: this.getSourceBreakdown(uniqueListings)
      };

      logger.info('Scraping and storage completed', summary);
      return summary;

    } catch (error) {
      logger.error('Failed to scrape and store properties', error);
      throw error;
    }
  }

  deduplicateListings(listings) {
    const seen = new Set();
    return listings.filter(listing => {
      if (seen.has(listing.id)) {
        return false;
      }
      seen.add(listing.id);
      return true;
    });
  }

  getSourceBreakdown(listings) {
    const breakdown = {};
    listings.forEach(listing => {
      breakdown[listing.source] = (breakdown[listing.source] || 0) + 1;
    });
    return breakdown;
  }

  async getStatistics() {
    try {
      const stats = await this.repository.getPropertyStats();
      const recent = await this.repository.getRecentProperties(5);
      
      return {
        statistics: stats,
        recent_properties: recent.map(p => ({
          id: p.id,
          title: p.title,
          price: p.price,
          source: p.source,
          fetched_at: p.fetched_at
        }))
      };
    } catch (error) {
      logger.error('Failed to get statistics', error);
      throw error;
    }
  }

  async close() {
    await this.db.disconnect();
    logger.info('Application closed');
  }
}

// Main execution
async function main() {
  const app = new PropertyScraperApp();

  try {
    await app.initialize();

    // Parse command line arguments
    const args = process.argv.slice(2);
    const command = args[0] || 'scrape';

    switch (command) {
      case 'scrape':
        const results = await app.scrapeAndStore({
          mercadolibreUrl: args[1] || 'https://inmuebles.mercadolibre.com.mx/casas/venta/',
          maxPages: parseInt(args[2]) || 3,
          includeScrapeDo: args[3] !== 'false'
        });
        console.log('\n📊 Summary:');
        console.log(JSON.stringify(results, null, 2));
        break;

      case 'stats':
        const stats = await app.getStatistics();
        console.log('\n📈 Statistics:');
        console.log(JSON.stringify(stats, null, 2));
        break;

      case 'search':
        const filters = {
          minPrice: args[1] ? parseInt(args[1]) : undefined,
          maxPrice: args[2] ? parseInt(args[2]) : undefined,
          bedrooms: args[3] ? parseInt(args[3]) : undefined
        };
        const properties = await app.repository.searchProperties(filters);
        console.log(`\n🔍 Found ${properties.length} properties:`);
        properties.slice(0, 10).forEach(p => {
          console.log(`- ${p.title} | $${p.price} | ${p.bedrooms}bd | ${p.source}`);
        });
        break;

      default:
        console.log(`
Usage: node src/index.js [command] [options]

Commands:
  scrape [url] [maxPages] [includeScrapeDo]  - Scrape and store properties
  stats                                       - Show database statistics
  search [minPrice] [maxPrice] [bedrooms]     - Search properties

Examples:
  node src/index.js scrape
  node src/index.js scrape "https://inmuebles.mercadolibre.com.mx/departamentos/renta/" 5
  node src/index.js stats
  node src/index.js search 1000000 5000000 3
        `);
    }

  } catch (error) {
    logger.error('Application error', error);
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await app.close();
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { PropertyScraperApp };