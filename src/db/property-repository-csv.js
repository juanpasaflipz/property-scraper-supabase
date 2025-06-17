import { Logger } from '../utils/logger.js';

export class PropertyRepositoryCSV {
  constructor(database) {
    this.db = database;
    this.logger = new Logger('PropertyRepositoryCSV');
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
          propertyId: property.external_id 
        });
        results.errors.push({
          id: property.external_id,
          error: error.message
        });
      }
    }

    return results;
  }

  async upsertProperty(property) {
    const query = `
      INSERT INTO properties (
        external_id, title, price, currency, location, city, state, country,
        bedrooms, bathrooms, size, property_type, link, description, 
        image_url, source, last_seen_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW())
      ON CONFLICT (external_id) DO UPDATE SET
        title = EXCLUDED.title,
        price = EXCLUDED.price,
        currency = EXCLUDED.currency,
        location = EXCLUDED.location,
        city = EXCLUDED.city,
        state = EXCLUDED.state,
        country = EXCLUDED.country,
        bedrooms = EXCLUDED.bedrooms,
        bathrooms = EXCLUDED.bathrooms,
        size = EXCLUDED.size,
        property_type = EXCLUDED.property_type,
        link = EXCLUDED.link,
        description = EXCLUDED.description,
        image_url = EXCLUDED.image_url,
        last_seen_at = NOW(),
        updated_at = NOW()
      RETURNING (xmax = 0) AS is_new;
    `;

    const values = [
      property.external_id,
      property.title,
      property.price,
      property.currency || 'MXN',
      property.location,
      property.city,
      property.state,
      property.country || 'Mexico',
      property.bedrooms || 0,
      property.bathrooms || 0,
      property.size || '0',
      property.property_type || 'Casa',
      property.link,
      property.description,
      property.image_url,
      property.source || 'mercadolibre'
    ];

    const result = await this.db.query(query, values);
    return {
      isNew: result.rows[0].is_new,
      property
    };
  }

  async getPropertyStats() {
    const query = `
      SELECT 
        source,
        COUNT(*) as count,
        COUNT(CASE WHEN bedrooms > 0 THEN 1 END) as has_bedrooms,
        COUNT(CASE WHEN bathrooms > 0 THEN 1 END) as has_bathrooms,
        COUNT(CASE WHEN CAST(size AS INTEGER) > 0 THEN 1 END) as has_size,
        COUNT(link) as has_link,
        COUNT(image_url) as has_image,
        AVG(CAST(price AS NUMERIC)) as avg_price,
        MIN(CAST(price AS NUMERIC)) as min_price,
        MAX(CAST(price AS NUMERIC)) as max_price
      FROM properties
      WHERE price != '0'
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
      query += ` AND CAST(price AS NUMERIC) >= $${paramIndex++}`;
      values.push(filters.minPrice);
    }

    if (filters.maxPrice) {
      query += ` AND CAST(price AS NUMERIC) <= $${paramIndex++}`;
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

    if (filters.minSize) {
      query += ` AND CAST(size AS INTEGER) >= $${paramIndex++}`;
      values.push(filters.minSize);
    }

    if (filters.state) {
      query += ` AND state ILIKE $${paramIndex++}`;
      values.push(`%${filters.state}%`);
    }

    if (filters.city) {
      query += ` AND city ILIKE $${paramIndex++}`;
      values.push(`%${filters.city}%`);
    }

    query += ' ORDER BY last_seen_at DESC LIMIT 100';

    const result = await this.db.query(query, values);
    return result.rows;
  }
}