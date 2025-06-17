import { Database } from '../db/database.js';
import { PropertyRepositoryCSV } from '../db/property-repository-csv.js';
import { MercadoLibreScraperImproved } from '../scrapers/mercadolibre-scraper-improved.js';
import { ScrapedoMercadoLibreScraper } from '../scrapers/scrapedo-mercadolibre.js';
import { Logger } from '../utils/logger.js';
import fs from 'fs/promises';
import path from 'path';

export class AutomatedScraperServiceWithFallback {
  constructor() {
    this.logger = new Logger('AutomatedScraperServiceWithFallback');
    this.db = null;
    this.repository = null;
    this.scraperScrapeDo = new ScrapedoMercadoLibreScraper();
    this.scraperDirect = new MercadoLibreScraperImproved();
    this.stateFilePath = path.join(process.cwd(), 'scraper-state.json');
    this.useScrapeDo = process.env.USE_SCRAPEDO === 'true';
  }

  async initialize() {
    this.db = new Database();
    await this.db.connect();
    this.repository = new PropertyRepositoryCSV(this.db);
    this.logger.info('Automated scraper service initialized', {
      useScrapeDo: this.useScrapeDo
    });
  }

  async loadState() {
    try {
      const data = await fs.readFile(this.stateFilePath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      return {
        lastRun: null,
        totalScraped: 0,
        totalNew: 0,
        totalUpdated: 0,
        runs: []
      };
    }
  }

  async saveState(state) {
    await fs.writeFile(this.stateFilePath, JSON.stringify(state, null, 2));
  }

  async getExistingIds() {
    const result = await this.db.query(`
      SELECT external_id 
      FROM properties 
      WHERE source = 'mercadolibre'
    `);
    
    return new Set(result.rows.map(r => r.external_id));
  }

  async scrapeThoroughSearch(searchParams) {
    const {
      propertyTypes = ['casas', 'departamentos'],
      operations = ['venta', 'renta'],
      states = ['distrito-federal', 'estado-de-mexico'],
      maxPagesPerSearch = 2
    } = searchParams;

    const allListings = [];
    const uniqueIds = new Set();

    for (const operation of operations) {
      for (const propertyType of propertyTypes) {
        for (const state of states) {
          try {
            const baseSearchUrl = `https://inmuebles.mercadolibre.com.mx/${propertyType}/${operation}/${state}/`;
            this.logger.info('Searching', { operation, propertyType, state });

            for (let page = 1; page <= maxPagesPerSearch; page++) {
              const offset = (page - 1) * 48;
              const url = `${baseSearchUrl}_Desde_${offset + 1}`;
              
              let listings = [];
              
              // Try Scrape.do first if enabled
              if (this.useScrapeDo) {
                try {
                  listings = await this.scraperScrapeDo.scrapeListings(url);
                } catch (error) {
                  this.logger.warn('Scrape.do failed, falling back to direct scraping', { error: error.message });
                  listings = await this.scraperDirect.scrapeListings(url);
                }
              } else {
                // Use direct scraper
                listings = await this.scraperDirect.scrapeListings(url);
              }
              
              // Add only unique listings
              listings.forEach(listing => {
                if (listing.external_id && !uniqueIds.has(listing.external_id)) {
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

  async runDailyUpdate() {
    const startTime = new Date();
    this.logger.info('Starting daily automated update', { startTime });

    try {
      const state = await this.loadState();
      const existingIds = await this.getExistingIds();
      this.logger.info('Loaded existing properties', { count: existingIds.size });

      const searchParams = {
        propertyTypes: ['casas', 'departamentos'],
        operations: ['venta'],
        states: ['distrito-federal', 'estado-de-mexico'],
        maxPagesPerSearch: 2
      };

      const allListings = await this.scrapeThoroughSearch(searchParams);
      
      const newListings = allListings.filter(listing => 
        !existingIds.has(listing.external_id)
      );

      const existingListings = allListings.filter(listing => 
        existingIds.has(listing.external_id)
      );

      this.logger.info('Scraping results', {
        total: allListings.length,
        new: newListings.length,
        existing: existingListings.length
      });

      let inserted = 0;
      let updated = 0;
      let errors = 0;

      if (newListings.length > 0) {
        const newResults = await this.repository.upsertProperties(newListings);
        inserted = newResults.inserted;
        errors += newResults.errors.length;
      }

      if (existingListings.length > 0) {
        const updateResults = await this.repository.upsertProperties(existingListings);
        updated = updateResults.updated;
        errors += updateResults.errors.length;
      }

      const endTime = new Date();
      const duration = (endTime - startTime) / 1000;

      const runSummary = {
        timestamp: startTime.toISOString(),
        duration: `${duration}s`,
        totalScraped: allListings.length,
        newListings: inserted,
        updatedListings: updated,
        errors,
        searchParams,
        scraperUsed: this.useScrapeDo ? 'scrape.do' : 'direct'
      };

      state.lastRun = startTime.toISOString();
      state.totalScraped += allListings.length;
      state.totalNew += inserted;
      state.totalUpdated += updated;
      state.runs.push(runSummary);
      
      if (state.runs.length > 30) {
        state.runs = state.runs.slice(-30);
      }

      await this.saveState(state);
      this.logger.info('Daily update completed', runSummary);
      await this.sendNotification(runSummary);

      return runSummary;

    } catch (error) {
      this.logger.error('Daily update failed', error);
      throw error;
    }
  }

  async sendNotification(summary) {
    if (summary.newListings > 0) {
      this.logger.info('New listings found!', {
        count: summary.newListings,
        timestamp: summary.timestamp
      });
    }
  }

  async getStatistics() {
    const stats = await this.db.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(DISTINCT external_id) as unique_properties,
        COUNT(DISTINCT state) as states_covered,
        COUNT(DISTINCT city) as cities_covered,
        COUNT(CASE WHEN property_type = 'Casa' THEN 1 END) as houses,
        COUNT(CASE WHEN property_type = 'Departamento' THEN 1 END) as apartments,
        AVG(CAST(price AS NUMERIC)) as avg_price,
        MIN(created_at) as oldest_listing,
        MAX(updated_at) as newest_update
      FROM properties
      WHERE source = 'mercadolibre'
    `);

    const recentNew = await this.db.query(`
      SELECT COUNT(*) as count
      FROM properties
      WHERE source = 'mercadolibre'
        AND created_at > NOW() - INTERVAL '24 hours'
    `);

    const state = await this.loadState();

    return {
      database: stats.rows[0],
      recentNew: recentNew.rows[0].count,
      scraperState: state
    };
  }

  async cleanup() {
    if (this.db) {
      await this.db.disconnect();
    }
  }
}