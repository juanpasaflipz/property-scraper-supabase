import { MercadoLibreDetailScraper } from '../scrapers/mercadolibre-detail-scraper.js';
import { Database } from '../db/database.js';
import { Logger } from '../utils/logger.js';

export class DetailScrapingQueue {
  constructor() {
    this.logger = new Logger('DetailScrapingQueue');
    this.db = new Database();
    this.detailScraper = new MercadoLibreDetailScraper();
    this.batchSize = 10;
    this.maxRetries = 3;
  }

  async processQueue(options = {}) {
    const {
      limit = 100,
      source = 'mercadolibre',
      onlyNew = true
    } = options;

    try {
      await this.db.connect();
      
      // Get properties that need detail scraping
      const query = `
        SELECT id, external_id, link, title
        FROM properties
        WHERE source = $1
        AND detail_scraped = FALSE
        AND link IS NOT NULL
        ${onlyNew ? 'AND created_at > NOW() - INTERVAL \'7 days\'' : ''}
        ORDER BY created_at DESC
        LIMIT $2
      `;
      
      const properties = await this.db.query(query, [source, limit]);
      
      if (properties.rows.length === 0) {
        this.logger.info('No properties need detail scraping');
        return { processed: 0, success: 0, errors: 0 };
      }
      
      this.logger.info(`Found ${properties.rows.length} properties to scrape details`);
      
      // Process in batches
      const results = {
        processed: 0,
        success: 0,
        errors: 0,
        details: []
      };
      
      for (let i = 0; i < properties.rows.length; i += this.batchSize) {
        const batch = properties.rows.slice(i, i + this.batchSize);
        
        this.logger.info(`Processing batch ${Math.floor(i / this.batchSize) + 1}/${Math.ceil(properties.rows.length / this.batchSize)}`);
        
        await this.processBatch(batch, results);
        
        // Delay between batches
        if (i + this.batchSize < properties.rows.length) {
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }
      
      return results;
      
    } catch (error) {
      this.logger.error('Queue processing failed', error);
      throw error;
    } finally {
      if (this.db.pool) {
        await this.db.pool.end();
      }
    }
  }

  async processBatch(batch, results) {
    for (const property of batch) {
      try {
        this.logger.info(`Scraping details for: ${property.title.substring(0, 50)}...`);
        
        const details = await this.detailScraper.scrapePropertyDetails(property.link);
        
        // Update database with details
        await this.updatePropertyDetails(property.id, details);
        
        results.processed++;
        results.success++;
        results.details.push({ id: property.id, external_id: property.external_id, details });
        
        this.logger.info(`✅ Successfully scraped details for property ${property.external_id}`);
        
      } catch (error) {
        results.processed++;
        results.errors++;
        
        this.logger.error(`Failed to scrape property ${property.external_id}`, error);
        
        // Mark as attempted to avoid repeated failures
        await this.markAsAttempted(property.id);
      }
      
      // Delay between properties
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  async updatePropertyDetails(propertyId, details) {
    const updateQuery = `
      UPDATE properties
      SET 
        description = $2,
        full_address = $3,
        neighborhood = $4,
        total_area_sqm = $5,
        built_area_sqm = $6,
        parking_spaces = $7,
        property_age = $8,
        views = $9,
        amenities = $10,
        features = $11,
        images = $12,
        technical_specs = $13,
        floor_plan_url = $14,
        seller_type = $15,
        publish_date = $16,
        detail_scraped = TRUE,
        last_scraped_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
    `;
    
    const values = [
      propertyId,
      details.description,
      details.fullAddress,
      details.neighborhood,
      details.totalArea ? parseFloat(details.totalArea) : null,
      details.builtArea ? parseFloat(details.builtArea) : null,
      details.parkingSpaces || 0,
      details.propertyAge,
      details.views,
      JSON.stringify(details.amenities || []),
      JSON.stringify(details.features || {}),
      JSON.stringify(details.images || []),
      JSON.stringify(details.technicalSpecs || {}),
      details.floorPlan,
      details.sellerType,
      details.publishDate
    ];
    
    await this.db.query(updateQuery, values);
  }

  async markAsAttempted(propertyId) {
    await this.db.query(
      'UPDATE properties SET last_scraped_at = NOW() WHERE id = $1',
      [propertyId]
    );
  }

  async getDetailedPropertyStats() {
    // Ensure database is connected
    if (!this.db.pool) {
      await this.db.connect();
    }
    
    const stats = await this.db.query(`
      SELECT 
        COUNT(*) as total_properties,
        COUNT(CASE WHEN detail_scraped = TRUE THEN 1 END) as with_details,
        COUNT(CASE WHEN detail_scraped = FALSE THEN 1 END) as without_details,
        COUNT(CASE WHEN images IS NOT NULL AND images != '[]'::jsonb THEN 1 END) as with_images,
        COUNT(CASE WHEN amenities IS NOT NULL AND amenities != '[]'::jsonb THEN 1 END) as with_amenities,
        AVG(CASE WHEN views IS NOT NULL THEN views END) as avg_views,
        AVG(CASE WHEN parking_spaces IS NOT NULL THEN parking_spaces END) as avg_parking
      FROM properties
      WHERE source = 'mercadolibre'
    `);
    
    return stats.rows[0];
  }

  async getTopAmenities(limit = 20) {
    // Ensure database is connected
    if (!this.db.pool) {
      await this.db.connect();
    }
    
    const result = await this.db.query(`
      WITH amenity_list AS (
        SELECT jsonb_array_elements_text(amenities) as amenity
        FROM properties
        WHERE amenities IS NOT NULL AND amenities != '[]'::jsonb
      )
      SELECT amenity, COUNT(*) as count
      FROM amenity_list
      GROUP BY amenity
      ORDER BY count DESC
      LIMIT $1
    `, [limit]);
    
    return result.rows;
  }

  async exportDetailedProperties(format = 'json') {
    const properties = await this.db.query(`
      SELECT *
      FROM properties
      WHERE detail_scraped = TRUE
      ORDER BY created_at DESC
    `);
    
    if (format === 'json') {
      return properties.rows;
    } else if (format === 'csv') {
      // Convert to CSV format
      // Implementation depends on your CSV library preference
      return this.convertToCSV(properties.rows);
    }
  }
}

export default DetailScrapingQueue;