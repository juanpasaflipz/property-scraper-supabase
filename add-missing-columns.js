import dotenv from 'dotenv';
dotenv.config();

import { Database } from './src/db/database.js';

async function addMissingColumns() {
  const db = new Database();
  
  try {
    await db.connect();
    console.log('✅ Connected to database\n');
    
    // Add area_sqm column
    console.log('📝 Adding area_sqm column...');
    await db.query(`
      ALTER TABLE properties 
      ADD COLUMN IF NOT EXISTS area_sqm NUMERIC;
    `);
    console.log('✅ area_sqm column added\n');
    
    // Copy size data to area_sqm
    console.log('📋 Copying size data to area_sqm...');
    const copyResult = await db.query(`
      UPDATE properties 
      SET area_sqm = CAST(NULLIF(REGEXP_REPLACE(size, '[^0-9.]', '', 'g'), '') AS NUMERIC)
      WHERE area_sqm IS NULL AND size IS NOT NULL;
    `);
    console.log(`✅ Updated ${copyResult.rowCount} rows with area data\n`);
    
    // Add other missing columns
    console.log('📝 Adding other missing columns...');
    
    await db.query(`
      ALTER TABLE properties 
      ADD COLUMN IF NOT EXISTS url TEXT;
    `);
    console.log('✅ url column added');
    
    await db.query(`
      ALTER TABLE properties 
      ADD COLUMN IF NOT EXISTS raw_data JSONB;
    `);
    console.log('✅ raw_data column added');
    
    await db.query(`
      ALTER TABLE properties 
      ADD COLUMN IF NOT EXISTS fetched_at TIMESTAMP DEFAULT NOW();
    `);
    console.log('✅ fetched_at column added\n');
    
    // Copy link data to url if needed
    console.log('📋 Copying link data to url...');
    const linkResult = await db.query(`
      UPDATE properties 
      SET url = link 
      WHERE url IS NULL AND link IS NOT NULL;
    `);
    console.log(`✅ Updated ${linkResult.rowCount} rows with url data\n`);
    
    // Verify columns
    const columns = await db.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'properties' 
      AND column_name IN ('address', 'area_sqm', 'url', 'raw_data', 'fetched_at', 'size', 'link')
      ORDER BY column_name;
    `);
    
    console.log('📊 Column status:');
    columns.rows.forEach(col => {
      console.log(`- ${col.column_name}: ${col.data_type}`);
    });
    
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

addMissingColumns();