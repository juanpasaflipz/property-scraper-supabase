import dotenv from 'dotenv';
dotenv.config();

import { AutomatedScraperMultiSource } from './services/automated-scraper-multi-source.js';
import { Logger } from './utils/logger.js';
import cron from 'node-cron';

const logger = new Logger('MultiSourceScheduler');

class MultiSourceScraperScheduler {
  constructor() {
    this.service = new AutomatedScraperMultiSource();
    this.isRunning = false;
  }

  async start() {
    logger.info('Starting multi-source scraper scheduler');
    
    // Initialize the service
    await this.service.initialize();

    // Run immediately on start if configured
    if (process.env.RUN_ON_START === 'true') {
      logger.info('Running initial multi-source scrape on start');
      await this.runScraper();
    }

    // Schedule daily runs at 2 AM (adjust as needed)
    const schedule = process.env.CRON_SCHEDULE || '0 2 * * *';
    
    cron.schedule(schedule, async () => {
      await this.runScraper();
    });

    logger.info('Multi-source scheduler started', { 
      schedule,
      sources: ['mercadolibre', 'lamudi']
    });

    // Keep the process running
    process.on('SIGINT', async () => {
      logger.info('Shutting down multi-source scheduler');
      await this.service.cleanup();
      process.exit(0);
    });
  }

  async runScraper() {
    if (this.isRunning) {
      logger.warn('Multi-source scraper is already running, skipping this run');
      return;
    }

    this.isRunning = true;
    
    try {
      logger.info('Starting scheduled multi-source scrape');
      const result = await this.service.runDailyUpdate();
      logger.info('Scheduled multi-source scrape completed', result);
    } catch (error) {
      logger.error('Scheduled multi-source scrape failed', error);
    } finally {
      this.isRunning = false;
    }
  }

  async runOnce() {
    // For testing - run once and exit
    await this.service.initialize();
    const result = await this.service.runDailyUpdate();
    
    console.log('\n✅ Multi-source scrape completed:\n');
    console.log('📊 Results by source:');
    console.log('====================');
    
    Object.entries(result.sources).forEach(([source, stats]) => {
      console.log(`\n${source.toUpperCase()}:`);
      console.log(`  Total: ${stats.total}`);
      console.log(`  New: ${stats.new}`);
      console.log(`  Updated: ${stats.updated}`);
      console.log(`  Errors: ${stats.errors}`);
    });
    
    console.log(`\n⏱️  Duration: ${result.duration}s`);
    
    await this.service.cleanup();
  }

  async showStats() {
    // Show current statistics
    await this.service.initialize();
    const stats = await this.service.getStatistics();
    
    console.log('\n📊 Multi-Source Scraper Statistics:');
    console.log('===================================');
    
    // Show stats for each source
    Object.entries(stats.sources).forEach(([source, sourceStats]) => {
      console.log(`\n${source.toUpperCase()}:`);
      console.log(`  Total Properties: ${sourceStats.total}`);
      console.log(`  Unique Properties: ${sourceStats.unique_properties}`);
      console.log(`  States Covered: ${sourceStats.states_covered}`);
      console.log(`  Cities Covered: ${sourceStats.cities_covered}`);
      console.log(`  Houses: ${sourceStats.houses}`);
      console.log(`  Apartments: ${sourceStats.apartments}`);
      if (sourceStats.avg_price) {
        console.log(`  Average Price: $${parseInt(sourceStats.avg_price).toLocaleString()} MXN`);
      }
    });
    
    console.log('\n📈 Recent Activity (Last 24h):');
    stats.recentNew.forEach(item => {
      console.log(`  ${item.source}: ${item.count} new listings`);
    });
    
    if (stats.scraperState.lastRun) {
      console.log(`\n⏰ Last Run: ${new Date(stats.scraperState.lastRun).toLocaleString()}`);
      console.log(`📊 All-time Totals:`);
      console.log(`  Total Scraped: ${stats.scraperState.totalScraped}`);
      console.log(`  Total New: ${stats.scraperState.totalNew}`);
      console.log(`  Total Updated: ${stats.scraperState.totalUpdated}`);
      
      if (stats.scraperState.sources) {
        console.log('\n📊 All-time by Source:');
        Object.entries(stats.scraperState.sources).forEach(([source, sourceStats]) => {
          console.log(`  ${source}: ${sourceStats.new} new, ${sourceStats.updated} updated`);
        });
      }
    }
    
    await this.service.cleanup();
  }
}

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const scheduler = new MultiSourceScraperScheduler();
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
Multi-Source Property Scraper Scheduler

This scheduler scrapes properties from multiple sources:
- MercadoLibre (Mexico's largest real estate portal)
- Lamudi (International real estate platform)

Usage:
  node src/scheduler-multi-source.js start    - Start the scheduler (runs continuously)
  node src/scheduler-multi-source.js run      - Run once and exit
  node src/scheduler-multi-source.js stats    - Show statistics

Environment Variables:
  CRON_SCHEDULE     - Cron expression (default: "0 2 * * *" - 2 AM daily)
  RUN_ON_START      - Run immediately when starting (default: false)
  USE_SCRAPEDO      - Use Scrape.do API for anti-bot bypass (default: false)
  SCRAPEDO_TOKEN    - Your Scrape.do API token

Example:
  USE_SCRAPEDO=true RUN_ON_START=true node src/scheduler-multi-source.js start
      `);
      process.exit(0);
  }
}

export { MultiSourceScraperScheduler };