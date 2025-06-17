import express from 'express';
import { AutomatedScraperService } from '../services/automated-scraper.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger('ScraperAPI');

export function createScraperAPI() {
  const router = express.Router();
  const service = new AutomatedScraperService();
  
  // Initialize service
  service.initialize().catch(err => {
    logger.error('Failed to initialize service', err);
  });

  // Trigger manual scrape
  router.post('/scrape', async (req, res) => {
    try {
      logger.info('Manual scrape triggered via API');
      
      // Run in background
      service.runDailyUpdate()
        .then(result => {
          logger.info('Manual scrape completed', result);
        })
        .catch(error => {
          logger.error('Manual scrape failed', error);
        });

      res.json({
        status: 'started',
        message: 'Scraping job started in background'
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  // Get statistics
  router.get('/stats', async (req, res) => {
    try {
      const stats = await service.getStatistics();
      res.json({
        status: 'success',
        data: stats
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  // Get recent new listings
  router.get('/new-listings', async (req, res) => {
    try {
      const hours = parseInt(req.query.hours) || 24;
      
      const result = await service.db.query(`
        SELECT external_id, title, price, city, state, bedrooms, bathrooms, size, link, created_at
        FROM properties
        WHERE source = 'mercadolibre'
          AND created_at > NOW() - INTERVAL '${hours} hours'
        ORDER BY created_at DESC
        LIMIT 50
      `);

      res.json({
        status: 'success',
        hours,
        count: result.rows.length,
        listings: result.rows
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  // Search listings
  router.get('/search', async (req, res) => {
    try {
      const filters = {
        minPrice: req.query.minPrice ? parseInt(req.query.minPrice) : undefined,
        maxPrice: req.query.maxPrice ? parseInt(req.query.maxPrice) : undefined,
        bedrooms: req.query.bedrooms ? parseInt(req.query.bedrooms) : undefined,
        bathrooms: req.query.bathrooms ? parseInt(req.query.bathrooms) : undefined,
        minSize: req.query.minSize ? parseInt(req.query.minSize) : undefined,
        state: req.query.state,
        city: req.query.city
      };

      const listings = await service.repository.searchProperties(filters);

      res.json({
        status: 'success',
        filters,
        count: listings.length,
        listings
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  return router;
}