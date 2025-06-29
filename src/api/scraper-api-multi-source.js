import express from 'express';
import { AutomatedScraperMultiSource } from '../services/automated-scraper-multi-source.js';
import { scrapeBR23 } from '../scrapers/br23-scraper.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger('MultiSourceScraperAPI');

export function createMultiSourceScraperAPI() {
  const router = express.Router();
  const service = new AutomatedScraperMultiSource();
  
  // Initialize service
  service.initialize().catch(err => {
    logger.error('Failed to initialize multi-source service', err);
  });

  // Trigger manual scrape for all sources
  router.post('/scrape', async (req, res) => {
    try {
      logger.info('Manual multi-source scrape triggered via API');
      
      // Run in background
      service.runDailyUpdate()
        .then(result => {
          logger.info('Manual multi-source scrape completed', result);
        })
        .catch(error => {
          logger.error('Manual multi-source scrape failed', error);
        });

      res.json({
        status: 'started',
        message: 'Multi-source scraping job started in background',
        sources: ['mercadolibre', 'lamudi', 'br23']
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  // Trigger scrape for specific source
  router.post('/scrape/:source', async (req, res) => {
    try {
      const source = req.params.source.toLowerCase();
      
      if (!['mercadolibre', 'lamudi', 'br23'].includes(source)) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid source. Must be "mercadolibre", "lamudi", or "br23"'
        });
      }

      logger.info(`Manual scrape triggered for ${source}`);

      // Run specific source in background
      const runSource = async () => {
        if (source === 'mercadolibre') {
          const listings = await service.scrapeMercadoLibre({});
          const existingIds = await service.getExistingIds('mercadolibre');
          
          let newCount = 0, updateCount = 0;
          for (const listing of listings) {
            if (existingIds.has(listing.external_id)) {
              await service.repository.updateProperty(listing);
              updateCount++;
            } else {
              await service.repository.insertProperty(listing);
              newCount++;
            }
          }
          
          return { total: listings.length, new: newCount, updated: updateCount };
        } else if (source === 'lamudi') {
          return await service.scrapeLamudi({});
        } else {
          // BR23
          const result = await scrapeBR23('all', 5, true);
          return { total: result.total, new: result.saved, updated: 0, errors: result.errors };
        }
      };

      runSource()
        .then(result => {
          logger.info(`Manual ${source} scrape completed`, result);
        })
        .catch(error => {
          logger.error(`Manual ${source} scrape failed`, error);
        });

      res.json({
        status: 'started',
        message: `${source} scraping job started in background`,
        source
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

  // Get statistics for specific source
  router.get('/stats/:source', async (req, res) => {
    try {
      const source = req.params.source.toLowerCase();
      
      if (!['mercadolibre', 'lamudi'].includes(source)) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid source'
        });
      }

      const stats = await service.getStatistics();
      res.json({
        status: 'success',
        source,
        data: {
          database: stats.sources[source],
          recentNew: stats.recentNew.find(s => s.source === source)?.count || 0
        }
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
      const source = req.query.source;
      
      let whereClause = `created_at > NOW() - INTERVAL '${hours} hours'`;
      if (source && ['mercadolibre', 'lamudi', 'br23'].includes(source)) {
        whereClause += ` AND source = '${source}'`;
      }
      
      const result = await service.db.query(`
        SELECT external_id, title, price, currency, city, state, 
               bedrooms, bathrooms, size, link, source, created_at
        FROM properties
        WHERE ${whereClause}
        ORDER BY created_at DESC
        LIMIT 50
      `);

      res.json({
        status: 'success',
        hours,
        source: source || 'all',
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
        city: req.query.city,
        source: req.query.source
      };

      // Build WHERE clause
      const conditions = ['1=1'];
      const params = [];
      let paramIndex = 1;

      if (filters.minPrice) {
        conditions.push(`CAST(price AS NUMERIC) >= $${paramIndex++}`);
        params.push(filters.minPrice);
      }
      if (filters.maxPrice) {
        conditions.push(`CAST(price AS NUMERIC) <= $${paramIndex++}`);
        params.push(filters.maxPrice);
      }
      if (filters.bedrooms) {
        conditions.push(`bedrooms >= $${paramIndex++}`);
        params.push(filters.bedrooms);
      }
      if (filters.bathrooms) {
        conditions.push(`bathrooms >= $${paramIndex++}`);
        params.push(filters.bathrooms);
      }
      if (filters.minSize) {
        conditions.push(`CAST(size AS NUMERIC) >= $${paramIndex++}`);
        params.push(filters.minSize);
      }
      if (filters.state) {
        conditions.push(`LOWER(state) = LOWER($${paramIndex++})`);
        params.push(filters.state);
      }
      if (filters.city) {
        conditions.push(`LOWER(city) LIKE LOWER($${paramIndex++})`);
        params.push(`%${filters.city}%`);
      }
      if (filters.source) {
        conditions.push(`source = $${paramIndex++}`);
        params.push(filters.source);
      }

      const query = `
        SELECT external_id, title, price, currency, city, state, 
               bedrooms, bathrooms, size, property_type, link, source, created_at
        FROM properties
        WHERE ${conditions.join(' AND ')}
        ORDER BY created_at DESC
        LIMIT 100
      `;

      const result = await service.db.query(query, params);

      res.json({
        status: 'success',
        filters,
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

  // Health check
  router.get('/health', (req, res) => {
    res.json({
      status: 'healthy',
      service: 'multi-source-scraper-api',
      sources: ['mercadolibre', 'lamudi'],
      timestamp: new Date().toISOString()
    });
  });

  return router;
}

// Create Express app with the multi-source API
export function createApp() {
  const app = express();
  
  app.use(express.json());
  
  // Mount the API
  app.use('/api', createMultiSourceScraperAPI());
  
  // Root endpoint
  app.get('/', (req, res) => {
    res.json({
      service: 'Property Scraper Multi-Source API',
      version: '2.0',
      sources: ['mercadolibre', 'lamudi'],
      endpoints: {
        'POST /api/scrape': 'Trigger scraping for all sources',
        'POST /api/scrape/:source': 'Trigger scraping for specific source',
        'GET /api/stats': 'Get statistics for all sources',
        'GET /api/stats/:source': 'Get statistics for specific source',
        'GET /api/new-listings': 'Get recent listings (optional ?source=mercadolibre|lamudi)',
        'GET /api/search': 'Search listings with filters',
        'GET /api/health': 'Health check'
      }
    });
  });
  
  return app;
}

// Start server if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const PORT = process.env.PORT || 3001;
  const app = createApp();
  
  app.listen(PORT, () => {
    console.log(`🚀 Multi-Source Scraper API running on port ${PORT}`);
    console.log(`📊 Sources: MercadoLibre, Lamudi`);
    console.log(`🔗 http://localhost:${PORT}`);
  });
}