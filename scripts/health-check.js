import dotenv from 'dotenv';
dotenv.config();

import { Database } from '../src/db/database.js';
import axios from 'axios';

async function healthCheck() {
  const results = {
    database: false,
    mercadolibre: false,
    lamudi: false,
    timestamp: new Date().toISOString()
  };

  // Check database
  try {
    const db = new Database();
    await db.connect();
    const result = await db.query('SELECT COUNT(*) FROM properties');
    results.database = true;
    results.propertyCount = parseInt(result.rows[0].count);
    await db.close();
  } catch (error) {
    console.error('❌ Database check failed:', error.message);
  }

  // Check MercadoLibre
  try {
    const response = await axios.get('https://inmuebles.mercadolibre.com.mx/casas/', {
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    results.mercadolibre = response.status === 200;
  } catch (error) {
    console.error('❌ MercadoLibre check failed:', error.message);
  }

  // Check Lamudi
  try {
    const response = await axios.get('https://www.lamudi.com.mx/casa/for-sale/', {
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    results.lamudi = response.status === 200;
  } catch (error) {
    console.error('❌ Lamudi check failed:', error.message);
  }

  // Report results
  console.log('\n🏥 Health Check Results:');
  console.log('========================');
  console.log(`Database: ${results.database ? '✅' : '❌'}`);
  if (results.propertyCount) {
    console.log(`  Properties: ${results.propertyCount.toLocaleString()}`);
  }
  console.log(`MercadoLibre: ${results.mercadolibre ? '✅' : '❌'}`);
  console.log(`Lamudi: ${results.lamudi ? '✅' : '❌'}`);
  console.log(`\nTimestamp: ${results.timestamp}`);

  // Exit with error code if any check failed
  const allHealthy = results.database && results.mercadolibre && results.lamudi;
  process.exit(allHealthy ? 0 : 1);
}

healthCheck();