import { Database } from '../db/database.js';
import { PropertyRepositoryCSV } from '../db/property-repository-csv.js';
import { ScrapedoMercadoLibreScraper } from '../scrapers/scrapedo-mercadolibre.js';
import { Logger } from '../utils/logger.js';
import fs from 'fs/promises';
import path from 'path';

export class AutomatedScraperService {
  constructor() {
    this.logger = new Logger('AutomatedScraperService');
    this.db = null;
    this.repository = null;
    this.scraper = new ScrapedoMercadoLibreScraper();
    this.stateFilePath = path.join(process.cwd(), 'scraper-state.json');
  }

  async initialize() {
    this.db = new Database();
    await this.db.connect();
    this.repository = new PropertyRepositoryCSV(this.db);
    this.logger.info('Automated scraper service initialized');
  }

  async loadState() {
    try {
      const data = await fs.readFile(this.stateFilePath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      // First run, no state file
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

  async runDailyUpdate() {
    const startTime = new Date();
    this.logger.info('Starting daily automated update', { startTime });

    try {
      // Load previous state
      const state = await this.loadState();
      
      // Get existing property IDs to detect new listings
      const existingIds = await this.getExistingIds();
      this.logger.info('Loaded existing properties', { count: existingIds.size });

      // Define search parameters for thorough search
      const searchParams = {
        propertyTypes: ['casas', 'departamentos'],
        operations: ['venta', 'renta'],
        states: [
          'distrito-federal',
          'estado-de-mexico', 
          'jalisco',
          'nuevo-leon',
          'queretaro',
          'puebla',
          'guanajuato',
          'yucatan'
        ],
        maxPagesPerSearch: 3 // Adjust based on your needs
      };

      // Perform thorough search
      const allListings = await this.scraper.scrapeThoroughSearch(searchParams);
      
      // Filter new listings
      const newListings = allListings.filter(listing => 
        !existingIds.has(listing.external_id)
      );

      // Also update existing listings (price changes, etc.)
      const existingListings = allListings.filter(listing => 
        existingIds.has(listing.external_id)
      );

      this.logger.info('Scraping results', {
        total: allListings.length,
        new: newListings.length,
        existing: existingListings.length
      });

      // Insert new listings
      let inserted = 0;
      let updated = 0;
      let errors = 0;

      if (newListings.length > 0) {
        const newResults = await this.repository.upsertProperties(newListings);
        inserted = newResults.inserted;
        errors += newResults.errors.length;
      }

      // Update existing listings (prices, availability, etc.)
      if (existingListings.length > 0) {
        const updateResults = await this.repository.upsertProperties(existingListings);
        updated = updateResults.updated;
        errors += updateResults.errors.length;
      }

      // Generate summary report
      const endTime = new Date();
      const duration = (endTime - startTime) / 1000; // seconds

      const runSummary = {
        timestamp: startTime.toISOString(),
        duration: `${duration}s`,
        totalScraped: allListings.length,
        newListings: inserted,
        updatedListings: updated,
        errors,
        searchParams
      };

      // Update and save state
      state.lastRun = startTime.toISOString();
      state.totalScraped += allListings.length;
      state.totalNew += inserted;
      state.totalUpdated += updated;
      state.runs.push(runSummary);
      
      // Keep only last 30 runs
      if (state.runs.length > 30) {
        state.runs = state.runs.slice(-30);
      }

      await this.saveState(state);

      // Log summary
      this.logger.info('Daily update completed', runSummary);

      // Send notification if configured
      await this.sendNotification(runSummary);

      return runSummary;

    } catch (error) {
      this.logger.error('Daily update failed', error);
      throw error;
    }
  }

  async sendNotification(summary) {
    // Implement notification logic here (email, webhook, etc.)
    // For now, just log it
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