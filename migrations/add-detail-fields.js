import dotenv from 'dotenv';
dotenv.config();

import { Database } from '../src/db/database.js';

async function addDetailFields() {
  const db = new Database();
  
  try {
    await db.connect();
    console.log('✅ Connected to database\n');
    
    console.log('📝 Adding detail fields to properties table...');
    
    // Add new columns for detailed information
    const alterQueries = [
      // Text fields
      `ALTER TABLE properties ADD COLUMN IF NOT EXISTS description TEXT`,
      `ALTER TABLE properties ADD COLUMN IF NOT EXISTS full_address TEXT`,
      `ALTER TABLE properties ADD COLUMN IF NOT EXISTS neighborhood VARCHAR(255)`,
      
      // Numeric fields
      `ALTER TABLE properties ADD COLUMN IF NOT EXISTS total_area_sqm NUMERIC`,
      `ALTER TABLE properties ADD COLUMN IF NOT EXISTS built_area_sqm NUMERIC`,
      `ALTER TABLE properties ADD COLUMN IF NOT EXISTS parking_spaces INTEGER DEFAULT 0`,
      `ALTER TABLE properties ADD COLUMN IF NOT EXISTS property_age INTEGER`,
      `ALTER TABLE properties ADD COLUMN IF NOT EXISTS views INTEGER`,
      
      // JSON fields for complex data
      `ALTER TABLE properties ADD COLUMN IF NOT EXISTS amenities JSONB DEFAULT '[]'::jsonb`,
      `ALTER TABLE properties ADD COLUMN IF NOT EXISTS features JSONB DEFAULT '{}'::jsonb`,
      `ALTER TABLE properties ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]'::jsonb`,
      `ALTER TABLE properties ADD COLUMN IF NOT EXISTS technical_specs JSONB DEFAULT '{}'::jsonb`,
      
      // Additional metadata
      `ALTER TABLE properties ADD COLUMN IF NOT EXISTS floor_plan_url TEXT`,
      `ALTER TABLE properties ADD COLUMN IF NOT EXISTS seller_type VARCHAR(50)`,
      `ALTER TABLE properties ADD COLUMN IF NOT EXISTS publish_date TIMESTAMP`,
      `ALTER TABLE properties ADD COLUMN IF NOT EXISTS last_scraped_at TIMESTAMP`,
      `ALTER TABLE properties ADD COLUMN IF NOT EXISTS detail_scraped BOOLEAN DEFAULT FALSE`
    ];
    
    for (const query of alterQueries) {
      try {
        await db.query(query);
        const columnName = query.match(/COLUMN IF NOT EXISTS (\w+)/)[1];
        console.log(`✅ Added column: ${columnName}`);
      } catch (error) {
        console.error(`❌ Failed to add column:`, error.message);
      }
    }
    
    // Create index for performance
    console.log('\n📝 Creating indexes...');
    
    const indexQueries = [
      `CREATE INDEX IF NOT EXISTS idx_properties_detail_scraped ON properties(detail_scraped)`,
      `CREATE INDEX IF NOT EXISTS idx_properties_neighborhood ON properties(neighborhood)`,
      `CREATE INDEX IF NOT EXISTS idx_properties_seller_type ON properties(seller_type)`,
      `CREATE INDEX IF NOT EXISTS idx_properties_publish_date ON properties(publish_date)`
    ];
    
    for (const query of indexQueries) {
      try {
        await db.query(query);
        const indexName = query.match(/INDEX IF NOT EXISTS (\w+)/)[1];
        console.log(`✅ Created index: ${indexName}`);
      } catch (error) {
        console.error(`❌ Failed to create index:`, error.message);
      }
    }
    
    // Verify columns were added
    console.log('\n📊 Verifying new columns...');
    const columns = await db.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'properties' 
      AND column_name IN (
        'description', 'full_address', 'neighborhood', 
        'total_area_sqm', 'built_area_sqm', 'parking_spaces',
        'amenities', 'features', 'images', 'detail_scraped'
      )
      ORDER BY column_name;
    `);
    
    console.log('\nNew columns added:');
    columns.rows.forEach(col => {
      console.log(`- ${col.column_name}: ${col.data_type}`);
    });
    
    // Show properties that need detail scraping
    const needsDetailCount = await db.query(`
      SELECT COUNT(*) 
      FROM properties 
      WHERE detail_scraped = FALSE 
      AND source = 'mercadolibre'
    `);
    
    console.log(`\n📊 Properties needing detail scraping: ${needsDetailCount.rows[0].count}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    if (db.pool) {
      await db.pool.end();
      console.log('\n👋 Database connection closed');
    }
  }
}

addDetailFields();