import dotenv from 'dotenv';
dotenv.config();

import { Database } from './src/db/database.js';

async function checkDatabase() {
  const db = new Database();
  
  try {
    await db.connect();
    console.log('✅ Connected to database\n');
    
    // Check if properties table exists
    const tableCheck = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'properties'
      );
    `);
    
    console.log('Table exists:', tableCheck.rows[0].exists);
    
    if (tableCheck.rows[0].exists) {
      // Get table structure
      const columns = await db.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'properties'
        ORDER BY ordinal_position;
      `);
      
      console.log('\n📊 Table structure:');
      columns.rows.forEach(col => {
        console.log(`- ${col.column_name}: ${col.data_type} ${col.is_nullable === 'NO' ? '(NOT NULL)' : ''}`);
      });
      
      // Get row count
      const count = await db.query('SELECT COUNT(*) FROM properties');
      console.log(`\n📈 Total rows: ${count.rows[0].count}`);
      
      // Get sample data
      const sample = await db.query('SELECT * FROM properties LIMIT 3');
      console.log(`\n📋 Sample data (${sample.rows.length} rows):`);
      sample.rows.forEach((row, i) => {
        console.log(`\nRow ${i + 1}:`);
        console.log(`- Title: ${row.title}`);
        console.log(`- Price: ${row.price}`);
        console.log(`- Source: ${row.source}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await db.close();
  }
}

checkDatabase();