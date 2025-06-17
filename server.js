import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import { createScraperAPI } from './src/api/scraper-api.js';
import { ScraperScheduler } from './src/scheduler.js';
import { Logger } from './src/utils/logger.js';

const logger = new Logger('Server');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'property-scraper'
  });
});

// API routes
app.use('/api', createScraperAPI());

// Start scheduler
const scheduler = new ScraperScheduler();

// Start server
app.listen(PORT, async () => {
  logger.info(`Server running on port ${PORT}`);
  
  // Start the scheduler
  await scheduler.start();
  
  console.log(`
🏠 Property Scraper Service Running

API Endpoints:
- GET  /health           - Health check
- POST /api/scrape       - Trigger manual scrape
- GET  /api/stats        - Get statistics
- GET  /api/new-listings - Get recent new listings
- GET  /api/search       - Search properties

Scheduler: Active (${process.env.CRON_SCHEDULE || '0 2 * * *'})
  `);
});