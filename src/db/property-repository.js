import { Logger } from '../utils/logger.js';

export class PropertyRepository {
  constructor(database) {
    this.db = database;
    this.logger = new Logger('PropertyRepository');
  }

  async upsertProperties(properties) {
    const results = {
      inserted: 0,
      updated: 0,
      errors: []
    };

    for (const property of properties) {
      try {
        const result = await this.upsertProperty(property);
        if (result.isNew) {
          results.inserted++;
        } else {
          results.updated++;
        }
      } catch (error) {
        this.logger.error('Failed to upsert property', error, { 
          propertyId: property.id 
        });
        results.errors.push({
          id: property.id,
          error: error.message
        });
      }
    }

    return results;
  }

  async upsertProperty(property) {
    const query = `
      INSERT INTO properties (
        id, title, price, address, bedrooms, bathrooms, 
        area_sqm, source, url, property_type, raw_data, fetched_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        price = EXCLUDED.price,
        address = EXCLUDED.address,
        bedrooms = EXCLUDED.bedrooms,
        bathrooms = EXCLUDED.bathrooms,
        area_sqm = EXCLUDED.area_sqm,
        source = EXCLUDED.source,
        url = EXCLUDED.url,
        property_type = EXCLUDED.property_type,
        raw_data = EXCLUDED.raw_data,
        fetched_at = NOW()
      RETURNING (xmax = 0) AS is_new;
    `;

    const values = [
      property.id,
      property.title,
      property.price || null,
      property.address || null,
      property.bedrooms || null,
      property.bathrooms || null,
      property.area_sqm || null,
      property.source,
      property.url || null,
      property.property_type || null,
      JSON.stringify(property.raw_data || property.raw_attributes || {})
    ];

    const result = await this.db.query(query, values);
    return {
      isNew: result.rows[0].is_new,
      property
    };
  }

  async getPropertyById(id) {
    const query = 'SELECT * FROM properties WHERE id = $1';
    const result = await this.db.query(query, [id]);
    return result.rows[0];
  }

  async getRecentProperties(limit = 10) {
    const query = `
      SELECT * FROM properties 
      ORDER BY fetched_at DESC 
      LIMIT $1
    `;
    const result = await this.db.query(query, [limit]);
    return result.rows;
  }

  async getPropertyStats() {
    const query = `
      SELECT 
        source,
        COUNT(*) as count,
        AVG(price) as avg_price,
        MIN(price) as min_price,
        MAX(price) as max_price,
        AVG(area_sqm) as avg_area
      FROM properties
      WHERE price > 0
      GROUP BY source
    `;
    
    const result = await this.db.query(query);
    return result.rows;
  }

  async searchProperties(filters = {}) {
    let query = 'SELECT * FROM properties WHERE 1=1';
    const values = [];
    let paramIndex = 1;

    if (filters.minPrice) {
      query += ` AND price >= $${paramIndex++}`;
      values.push(filters.minPrice);
    }

    if (filters.maxPrice) {
      query += ` AND price <= $${paramIndex++}`;
      values.push(filters.maxPrice);
    }

    if (filters.bedrooms) {
      query += ` AND bedrooms >= $${paramIndex++}`;
      values.push(filters.bedrooms);
    }

    if (filters.bathrooms) {
      query += ` AND bathrooms >= $${paramIndex++}`;
      values.push(filters.bathrooms);
    }

    if (filters.minArea) {
      query += ` AND area_sqm >= $${paramIndex++}`;
      values.push(filters.minArea);
    }

    if (filters.source) {
      query += ` AND source = $${paramIndex++}`;
      values.push(filters.source);
    }

    if (filters.propertyType) {
      query += ` AND property_type = $${paramIndex++}`;
      values.push(filters.propertyType);
    }

    query += ' ORDER BY fetched_at DESC LIMIT 100';

    const result = await this.db.query(query, values);
    return result.rows;
  }
}