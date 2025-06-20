#!/usr/bin/env node

import { AutomatedScraperService } from '../src/services/automated-scraper.js';

// Create and run the service
const scraperService = new AutomatedScraperService();

console.log('🚀 Starting automated scraper service...\n');

// Run immediately
scraperService.runDailyUpdate()
  .then(result => {
    console.log('\n✅ Scraping completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Scraping failed:', error.message);
    process.exit(1);
  });