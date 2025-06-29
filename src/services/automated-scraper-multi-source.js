import { Database } from '../db/database.js';
import { PropertyRepositoryCSV } from '../db/property-repository-csv.js';
import { MercadoLibreScraperImproved } from '../scrapers/mercadolibre-scraper-improved.js';
import { ScrapedoMercadoLibreScraper } from '../scrapers/scrapedo-mercadolibre.js';
import { LamudiScraperWithFallback } from '../scrapers/lamudi-scraper-fallback.js';
import { scrapeBR23 } from '../scrapers/br23-scraper.js';
import { Logger } from '../utils/logger.js';
import fs from 'fs/promises';
import path from 'path';

export class AutomatedScraperMultiSource {
  constructor() {
    this.logger = new Logger('AutomatedScraperMultiSource');
    this.db = null;
    this.repository = null;
    
    // MercadoLibre scrapers
    this.mlScraperScrapeDo = new ScrapedoMercadoLibreScraper();
    this.mlScraperDirect = new MercadoLibreScraperImproved();
    
    // Lamudi scraper (has built-in fallback)
    this.lamudiScraper = new LamudiScraperWithFallback();
    
    this.stateFilePath = path.join(process.cwd(), 'scraper-state.json');
    this.useScrapeDo = process.env.USE_SCRAPEDO === 'true';
  }

  async initialize() {
    this.db = new Database();
    await this.db.connect();
    this.repository = new PropertyRepositoryCSV(this.db);
    this.logger.info('Multi-source automated scraper service initialized', {
      useScrapeDo: this.useScrapeDo,
      sources: ['mercadolibre', 'lamudi', 'br23']
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
        runs: [],
        sources: {
          mercadolibre: { total: 0, new: 0, updated: 0 },
          lamudi: { total: 0, new: 0, updated: 0 },
          br23: { total: 0, new: 0, updated: 0 }
        }
      };
    }
  }

  async saveState(state) {
    await fs.writeFile(this.stateFilePath, JSON.stringify(state, null, 2));
  }

  async getExistingIds(source) {
    const result = await this.db.query(`
      SELECT external_id 
      FROM properties 
      WHERE source = $1
    `, [source]);
    
    return new Set(result.rows.map(r => r.external_id));
  }

  async scrapeMercadoLibre(searchParams) {
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
            this.logger.info('Searching MercadoLibre', { operation, propertyType, state });

            for (let page = 1; page <= maxPagesPerSearch; page++) {
              const offset = (page - 1) * 48;
              const url = `${baseSearchUrl}_Desde_${offset + 1}`;
              
              let listings = [];
              
              // Try Scrape.do first if enabled
              if (this.useScrapeDo) {
                try {
                  listings = await this.mlScraperScrapeDo.scrapeListings(url);
                } catch (error) {
                  this.logger.info('Scrape.do failed for MercadoLibre, falling back to direct', { error: error.message });
                  listings = await this.mlScraperDirect.scrapeListings(url);
                }
              } else {
                listings = await this.mlScraperDirect.scrapeListings(url);
              }
              
              // Add only unique listings
              listings.forEach(listing => {
                if (listing.external_id && !uniqueIds.has(listing.external_id)) {
                  uniqueIds.add(listing.external_id);
                  allListings.push(listing);
                }
              });

              // Rate limiting
              await this.sleep(2000);
            }
          } catch (error) {
            this.logger.error('Error in MercadoLibre search', error, { operation, propertyType, state });
          }
        }
      }
    }

    return allListings;
  }

  async scrapeLamudi(searchParams) {
    const {
      cities = ['mexico city', 'guadalajara', 'monterrey'],
      operations = ['rent', 'sale'],
      maxPages = 5
    } = searchParams;

    const results = {
      total: 0,
      new: 0,
      updated: 0,
      errors: 0
    };

    for (const city of cities) {
      for (const operation of operations) {
        try {
          this.logger.info('Scraping Lamudi', { city, operation });
          
          // The Lamudi scraper handles its own database operations
          const result = await this.lamudiScraper.scrapeLamudiToSupabase(city, operation);
          
          results.total += result.total;
          results.new += result.added;
          results.updated += result.updated;
          results.errors += result.errors;
          
          // Rate limiting between searches
          await this.sleep(3000);
        } catch (error) {
          this.logger.error('Error in Lamudi search', error, { city, operation });
          results.errors++;
        }
      }
    }

    return results;
  }

  async runDailyUpdate() {
    try {
      this.logger.info('Starting multi-source daily update');
      
      const runSummary = {
        timestamp: new Date().toISOString(),
        sources: {
          mercadolibre: { total: 0, new: 0, updated: 0, errors: 0 },
          lamudi: { total: 0, new: 0, updated: 0, errors: 0 }
        },
        duration: 0
      };

      const startTime = Date.now();

      // Load state
      const state = await this.loadState();
      
      // 1. Scrape MercadoLibre
      this.logger.info('Starting MercadoLibre scraping');
      const existingMLIds = await this.getExistingIds('mercadolibre');
      const mlListings = await this.scrapeMercadoLibre({
        propertyTypes: ['casas', 'departamentos'],
        operations: ['venta', 'renta'],
        states: ['distrito-federal', 'estado-de-mexico', 'jalisco', 'nuevo-leon'],
        maxPagesPerSearch: 3
      });

      // Process MercadoLibre listings
      for (const listing of mlListings) {
        try {
          if (existingMLIds.has(listing.external_id)) {
            await this.repository.updateProperty(listing);
            runSummary.sources.mercadolibre.updated++;
          } else {
            await this.repository.insertProperty(listing);
            runSummary.sources.mercadolibre.new++;
          }
          runSummary.sources.mercadolibre.total++;
        } catch (error) {
          this.logger.error('Failed to save MercadoLibre listing', error, { id: listing.external_id });
          runSummary.sources.mercadolibre.errors++;
        }
      }

      // 2. Scrape Lamudi
      this.logger.info('Starting Lamudi scraping');
      const lamudiResult = await this.scrapeLamudi({
        cities: ['mexico city', 'guadalajara', 'monterrey', 'cancun'],
        operations: ['rent', 'sale'],
        maxPages: 5
      });

      runSummary.sources.lamudi = lamudiResult;

      // 3. Scrape BR23
      this.logger.info('Starting BR23 scraping');
      const br23Result = await scrapeBR23('all', 5, true);
      runSummary.sources.br23 = {
        total: br23Result.total,
        new: br23Result.saved,
        updated: 0,
        errors: br23Result.errors
      };

      // Calculate totals
      runSummary.duration = Math.round((Date.now() - startTime) / 1000);
      
      const totalNew = runSummary.sources.mercadolibre.new + runSummary.sources.lamudi.new + runSummary.sources.br23.new;
      const totalUpdated = runSummary.sources.mercadolibre.updated + runSummary.sources.lamudi.updated + runSummary.sources.br23.updated;
      const totalScraped = runSummary.sources.mercadolibre.total + runSummary.sources.lamudi.total + runSummary.sources.br23.total;

      // Update state
      state.lastRun = runSummary.timestamp;
      state.totalScraped += totalScraped;
      state.totalNew += totalNew;
      state.totalUpdated += totalUpdated;
      
      // Update source-specific stats
      if (!state.sources) state.sources = {};
      Object.keys(runSummary.sources).forEach(source => {
        if (!state.sources[source]) state.sources[source] = { total: 0, new: 0, updated: 0 };
        state.sources[source].total += runSummary.sources[source].total;
        state.sources[source].new += runSummary.sources[source].new;
        state.sources[source].updated += runSummary.sources[source].updated;
      });

      state.runs.push(runSummary);
      if (state.runs.length > 30) state.runs.shift();

      await this.saveState(state);

      this.logger.info('Multi-source daily update completed', {
        totalNew,
        totalUpdated,
        totalScraped,
        duration: runSummary.duration,
        sources: runSummary.sources
      });

      await this.sendNotification({
        newListings: totalNew,
        updatedListings: totalUpdated,
        timestamp: runSummary.timestamp,
        sources: runSummary.sources
      });

      return runSummary;

    } catch (error) {
      this.logger.error('Multi-source daily update failed', error);
      throw error;
    }
  }

  async sendNotification(summary) {
    if (summary.newListings > 0) {
      this.logger.info('New listings found across sources!', {
        total: summary.newListings,
        mercadolibre: summary.sources.mercadolibre.new,
        lamudi: summary.sources.lamudi.new,
        timestamp: summary.timestamp
      });
    }
  }

  async getStatistics() {
    const mlStats = await this.db.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(DISTINCT external_id) as unique_properties,
        COUNT(DISTINCT state) as states_covered,
        COUNT(DISTINCT city) as cities_covered,
        COUNT(CASE WHEN property_type = 'Casa' THEN 1 END) as houses,
        COUNT(CASE WHEN property_type = 'Departamento' THEN 1 END) as apartments,
        AVG(CAST(price AS NUMERIC)) as avg_price
      FROM properties
      WHERE source = 'mercadolibre'
    `);

    const lamudiStats = await this.db.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(DISTINCT external_id) as unique_properties,
        COUNT(DISTINCT state) as states_covered,
        COUNT(DISTINCT city) as cities_covered,
        COUNT(CASE WHEN property_type = 'Casa' THEN 1 END) as houses,
        COUNT(CASE WHEN property_type = 'Departamento' THEN 1 END) as apartments,
        AVG(CAST(price AS NUMERIC)) as avg_price
      FROM properties
      WHERE source = 'lamudi'
    `);

    const recentNew = await this.db.query(`
      SELECT 
        source,
        COUNT(*) as count
      FROM properties
      WHERE created_at > NOW() - INTERVAL '24 hours'
      GROUP BY source
    `);

    const state = await this.loadState();

    return {
      sources: {
        mercadolibre: mlStats.rows[0],
        lamudi: lamudiStats.rows[0]
      },
      recentNew: recentNew.rows,
      scraperState: state
    };
  }

  async cleanup() {
    if (this.db) {
      await this.db.disconnect();
    }
    await this.lamudiScraper.close();
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export a function to run the scraper
export async function runMultiSourceScraper() {
  const scraper = new AutomatedScraperMultiSource();
  
  try {
    await scraper.initialize();
    const result = await scraper.runDailyUpdate();
    
    console.log('\n📊 Multi-Source Scraping Complete:');
    console.log(`Total new listings: ${result.sources.mercadolibre.new + result.sources.lamudi.new}`);
    console.log(`- MercadoLibre: ${result.sources.mercadolibre.new} new, ${result.sources.mercadolibre.updated} updated`);
    console.log(`- Lamudi: ${result.sources.lamudi.new} new, ${result.sources.lamudi.updated} updated`);
    console.log(`Duration: ${result.duration}s`);
    
    return result;
  } finally {
    await scraper.cleanup();
  }
}