import dotenv from 'dotenv';
dotenv.config();

import { DetailScrapingQueue } from './detail-scraping-queue.js';
import { Logger } from '../utils/logger.js';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * Standalone service for enriching properties with detailed information
 * Runs independently from the main scraping process
 */
export class DetailEnrichmentService {
  constructor() {
    this.logger = new Logger('DetailEnrichmentService');
    this.queue = new DetailScrapingQueue();
    this.stateFile = path.join(process.cwd(), 'data', 'detail-enrichment-state.json');
    this.isRunning = false;
  }

  async initialize() {
    // Ensure data directory exists
    await fs.mkdir(path.dirname(this.stateFile), { recursive: true });
    
    // Load previous state
    try {
      const stateData = await fs.readFile(this.stateFile, 'utf8');
      this.state = JSON.parse(stateData);
    } catch (error) {
      this.state = {
        lastRun: null,
        totalProcessed: 0,
        totalSuccess: 0,
        totalErrors: 0,
        runs: []
      };
    }
  }

  async runEnrichment(options = {}) {
    if (this.isRunning) {
      this.logger.warn('Enrichment already running, skipping...');
      return;
    }

    this.isRunning = true;
    const runId = Date.now();
    
    try {
      await this.initialize();
      
      this.logger.info('Starting detail enrichment cycle', { runId });
      
      // Default options - conservative to not interfere with main scraping
      const enrichmentOptions = {
        limit: options.limit || 30,  // Process 30 properties per run
        onlyNew: options.onlyNew !== false,  // Default to only new properties
        source: options.source || 'mercadolibre'
      };
      
      // Check if we should run based on timing
      if (!this.shouldRun()) {
        this.logger.info('Skipping run - too soon after last run');
        return;
      }
      
      // Get current statistics
      const beforeStats = await this.queue.getDetailedPropertyStats();
      this.logger.info('Properties needing enrichment', { 
        count: beforeStats.without_details 
      });
      
      if (beforeStats.without_details === 0) {
        this.logger.info('All properties already have details');
        return;
      }
      
      // Process properties
      const startTime = Date.now();
      const results = await this.queue.processQueue(enrichmentOptions);
      const duration = Date.now() - startTime;
      
      // Update state
      const runInfo = {
        runId,
        timestamp: new Date().toISOString(),
        duration: duration / 1000,
        processed: results.processed,
        success: results.success,
        errors: results.errors,
        options: enrichmentOptions
      };
      
      this.state.lastRun = runInfo.timestamp;
      this.state.totalProcessed += results.processed;
      this.state.totalSuccess += results.success;
      this.state.totalErrors += results.errors;
      this.state.runs.push(runInfo);
      
      // Keep only last 100 runs
      if (this.state.runs.length > 100) {
        this.state.runs = this.state.runs.slice(-100);
      }
      
      await this.saveState();
      
      // Log summary
      this.logger.info('Enrichment cycle completed', {
        runId,
        duration: `${(duration / 1000).toFixed(2)}s`,
        processed: results.processed,
        success: results.success,
        errors: results.errors
      });
      
      // Get updated statistics
      const afterStats = await this.queue.getDetailedPropertyStats();
      this.logger.info('Updated statistics', {
        withDetails: afterStats.with_details,
        withoutDetails: afterStats.without_details,
        newlyEnriched: afterStats.with_details - beforeStats.with_details
      });
      
    } catch (error) {
      this.logger.error('Enrichment cycle failed', error);
    } finally {
      this.isRunning = false;
    }
  }

  shouldRun() {
    if (!this.state.lastRun) return true;
    
    // Don't run more than once per hour to avoid rate limiting
    const lastRunTime = new Date(this.state.lastRun).getTime();
    const hoursSinceLastRun = (Date.now() - lastRunTime) / (1000 * 60 * 60);
    
    return hoursSinceLastRun >= 1;
  }

  async saveState() {
    await fs.writeFile(
      this.stateFile, 
      JSON.stringify(this.state, null, 2)
    );
  }

  async getStatistics() {
    await this.initialize();
    
    const dbStats = await this.queue.getDetailedPropertyStats();
    const recentRuns = this.state.runs.slice(-10);
    
    return {
      database: dbStats,
      enrichment: {
        lastRun: this.state.lastRun,
        totalProcessed: this.state.totalProcessed,
        totalSuccess: this.state.totalSuccess,
        totalErrors: this.state.totalErrors,
        successRate: this.state.totalProcessed > 0 
          ? Math.round((this.state.totalSuccess / this.state.totalProcessed) * 100) 
          : 0,
        recentRuns
      }
    };
  }

  async runContinuously(intervalMinutes = 60) {
    this.logger.info(`Starting continuous enrichment service (every ${intervalMinutes} minutes)`);
    
    // Run immediately
    await this.runEnrichment();
    
    // Then run periodically
    setInterval(async () => {
      await this.runEnrichment();
    }, intervalMinutes * 60 * 1000);
    
    // Handle graceful shutdown
    process.on('SIGINT', () => {
      this.logger.info('Shutting down enrichment service...');
      process.exit(0);
    });
  }
}

// If running directly, start the service
if (import.meta.url === `file://${process.argv[1]}`) {
  const service = new DetailEnrichmentService();
  
  // Get interval from command line or environment
  const interval = parseInt(process.env.DETAIL_ENRICHMENT_INTERVAL || '60');
  
  service.runContinuously(interval).catch(error => {
    console.error('Failed to start enrichment service:', error);
    process.exit(1);
  });
}

export default DetailEnrichmentService;