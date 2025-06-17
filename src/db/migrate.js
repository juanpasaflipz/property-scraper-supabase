import dotenv from 'dotenv';
import { Database } from './database.js';
import { Logger } from '../utils/logger.js';

dotenv.config();

const logger = new Logger('Migration');

const createPropertiesTable = `
CREATE TABLE IF NOT EXISTS properties (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  price NUMERIC,
  address TEXT,
  bedrooms INTEGER,
  bathrooms INTEGER,
  area_sqm NUMERIC,
  source TEXT NOT NULL,
  url TEXT,
  property_type TEXT,
  fetched_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  raw_data JSONB
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_properties_source ON properties(source);
CREATE INDEX IF NOT EXISTS idx_properties_price ON properties(price);
CREATE INDEX IF NOT EXISTS idx_properties_bedrooms ON properties(bedrooms);
CREATE INDEX IF NOT EXISTS idx_properties_fetched_at ON properties(fetched_at DESC);

-- Create a function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at
DROP TRIGGER IF EXISTS update_properties_updated_at ON properties;
CREATE TRIGGER update_properties_updated_at
BEFORE UPDATE ON properties
FOR EACH ROW
EXECUTE PROCEDURE update_updated_at_column();
`;

async function migrate() {
  const db = new Database();

  try {
    logger.info('Starting database migration');
    
    await db.connect();
    
    // Run migration
    await db.query(createPropertiesTable);
    
    // Verify table exists
    const result = await db.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'properties'
      ORDER BY ordinal_position;
    `);
    
    logger.info('Migration completed successfully', {
      columns: result.rows.map(r => `${r.column_name} (${r.data_type})`)
    });

    await db.disconnect();
  } catch (error) {
    logger.error('Migration failed', error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  migrate();
}

export { migrate };