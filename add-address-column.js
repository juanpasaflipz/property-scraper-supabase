import dotenv from 'dotenv';
dotenv.config();

import { Database } from './src/db/database.js';

async function addAddressColumn() {
  const db = new Database();
  
  try {
    await db.connect();
    console.log('✅ Connected to database\n');
    
    // Add address column
    console.log('📝 Adding address column to properties table...');
    
    const alterTableQuery = `
      ALTER TABLE properties 
      ADD COLUMN IF NOT EXISTS address TEXT;
    `;
    
    await db.query(alterTableQuery);
    console.log('✅ Address column added successfully\n');
    
    // Copy existing location data to address column if needed
    console.log('📋 Copying location data to address column...');
    
    const updateQuery = `
      UPDATE properties 
      SET address = location 
      WHERE address IS NULL AND location IS NOT NULL;
    `;
    
    const result = await db.query(updateQuery);
    console.log(`✅ Updated ${result.rowCount} rows with address data\n`);
    
    // Verify the column was added
    const columns = await db.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'properties' 
      AND column_name IN ('address', 'location')
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

addAddressColumn();