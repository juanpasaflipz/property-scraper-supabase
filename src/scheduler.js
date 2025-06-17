import dotenv from 'dotenv';
dotenv.config();

import { AutomatedScraperService } from './services/automated-scraper.js';
import { Logger } from './utils/logger.js';
import cron from 'node-cron';

const logger = new Logger('Scheduler');

class ScraperScheduler {
  constructor() {
    this.service = new AutomatedScraperService();
    this.isRunning = false;
  }

  async start() {
    logger.info('Starting scraper scheduler');
    
    // Initialize the service
    await this.service.initialize();

    // Run immediately on start if configured
    if (process.env.RUN_ON_START === 'true') {
      logger.info('Running initial scrape on start');
      await this.runScraper();
    }

    // Schedule daily runs at 2 AM (adjust as needed)
    const schedule = process.env.CRON_SCHEDULE || '0 2 * * *';
    
    cron.schedule(schedule, async () => {
      await this.runScraper();
    });

    logger.info('Scheduler started', { schedule });

    // Keep the process running
    process.on('SIGINT', async () => {
      logger.info('Shutting down scheduler');
      await this.service.cleanup();
      process.exit(0);
    });
  }

  async runScraper() {
    if (this.isRunning) {
      logger.warn('Scraper is already running, skipping this run');
      return;
    }

    this.isRunning = true;
    
    try {
      logger.info('Starting scheduled scrape');
      const result = await this.service.runDailyUpdate();
      logger.info('Scheduled scrape completed', result);
    } catch (error) {
      logger.error('Scheduled scrape failed', error);
    } finally {
      this.isRunning = false;
    }
  }

  async runOnce() {
    // For testing - run once and exit
    await this.service.initialize();
    const result = await this.service.runDailyUpdate();
    console.log('Scrape completed:', result);
    await this.service.cleanup();
  }

  async showStats() {
    // Show current statistics
    await this.service.initialize();
    const stats = await this.service.getStatistics();
    console.log('\n📊 Scraper Statistics:');
    console.log('======================');
    console.log(`Total Properties: ${stats.database.total}`);
    console.log(`Unique Properties: ${stats.database.unique_properties}`);
    console.log(`States Covered: ${stats.database.states_covered}`);
    console.log(`Cities Covered: ${stats.database.cities_covered}`);
    console.log(`Houses: ${stats.database.houses}`);
    console.log(`Apartments: ${stats.database.apartments}`);
    console.log(`Average Price: $${parseInt(stats.database.avg_price).toLocaleString()} MXN`);
    console.log(`New in Last 24h: ${stats.recentNew}`);
    
    if (stats.scraperState.lastRun) {
      console.log(`\nLast Run: ${new Date(stats.scraperState.lastRun).toLocaleString()}`);
      console.log(`Total Scraped: ${stats.scraperState.totalScraped}`);
      console.log(`Total New: ${stats.scraperState.totalNew}`);
      console.log(`Total Updated: ${stats.scraperState.totalUpdated}`);
    }
    
    await this.service.cleanup();
  }
}

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const scheduler = new ScraperScheduler();
  const command = process.argv[2];

  switch (command) {
    case 'start':
      scheduler.start().catch(console.error);
      break;
    case 'run':
      scheduler.runOnce().then(() => process.exit(0)).catch(console.error);
      break;
    case 'stats':
      scheduler.showStats().then(() => process.exit(0)).catch(console.error);
      break;
    default:
      console.log(`
Property Scraper Scheduler

Usage:
  node src/scheduler.js start    - Start the scheduler (runs continuously)
  node src/scheduler.js run      - Run once and exit
  node src/scheduler.js stats    - Show statistics

Environment Variables:
  CRON_SCHEDULE     - Cron expression (default: "0 2 * * *" - 2 AM daily)
  RUN_ON_START      - Run immediately when starting (default: false)
      `);
      process.exit(0);
  }
}

export { ScraperScheduler };