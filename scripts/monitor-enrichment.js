import dotenv from 'dotenv';
dotenv.config();

import { DetailEnrichmentService } from '../src/services/detail-enrichment-service.js';
import { Database } from '../src/db/database.js';

async function monitorEnrichment() {
  const service = new DetailEnrichmentService();
  const db = new Database();
  
  console.log('📊 Detail Enrichment Monitor\n');
  
  try {
    await db.connect();
    
    // Get statistics
    const stats = await service.getStatistics();
    
    // Display database stats
    console.log('🗄️  Database Status:');
    console.log(`- Total properties: ${stats.database.total_properties}`);
    console.log(`- With details: ${stats.database.with_details} (${Math.round(stats.database.with_details / stats.database.total_properties * 100)}%)`);
    console.log(`- Without details: ${stats.database.without_details}`);
    console.log(`- With images: ${stats.database.with_images}`);
    console.log(`- With amenities: ${stats.database.with_amenities}`);
    
    // Display enrichment stats
    console.log('\n⚡ Enrichment Service Status:');
    if (stats.enrichment.lastRun) {
      const lastRunDate = new Date(stats.enrichment.lastRun);
      const hoursAgo = Math.round((Date.now() - lastRunDate.getTime()) / (1000 * 60 * 60));
      console.log(`- Last run: ${lastRunDate.toLocaleString()} (${hoursAgo}h ago)`);
    } else {
      console.log(`- Last run: Never`);
    }
    console.log(`- Total processed: ${stats.enrichment.totalProcessed}`);
    console.log(`- Total successful: ${stats.enrichment.totalSuccess}`);
    console.log(`- Total errors: ${stats.enrichment.totalErrors}`);
    console.log(`- Success rate: ${stats.enrichment.successRate}%`);
    
    // Show recent runs
    if (stats.enrichment.recentRuns.length > 0) {
      console.log('\n📈 Recent Runs:');
      stats.enrichment.recentRuns.slice(-5).forEach((run, i) => {
        const runDate = new Date(run.timestamp);
        console.log(`${i + 1}. ${runDate.toLocaleString()} - ${run.success}/${run.processed} successful (${run.duration.toFixed(1)}s)`);
      });
    }
    
    // Check if service is healthy
    console.log('\n🏥 Health Check:');
    const needsEnrichment = stats.database.without_details > 0;
    const recentlyRun = stats.enrichment.lastRun && 
      (Date.now() - new Date(stats.enrichment.lastRun).getTime()) < 2 * 60 * 60 * 1000; // 2 hours
    
    if (needsEnrichment && !recentlyRun) {
      console.log('⚠️  Service may be stuck - properties need enrichment but no recent runs');
    } else if (!needsEnrichment) {
      console.log('✅ All properties have details - service is idle');
    } else {
      console.log('✅ Service is healthy');
    }
    
    // Show properties by enrichment status
    const enrichmentProgress = await db.query(`
      SELECT 
        DATE_TRUNC('day', created_at) as date,
        COUNT(CASE WHEN detail_scraped = TRUE THEN 1 END) as with_details,
        COUNT(CASE WHEN detail_scraped = FALSE THEN 1 END) as without_details
      FROM properties
      WHERE created_at > NOW() - INTERVAL '7 days'
      GROUP BY date
      ORDER BY date DESC
    `);
    
    if (enrichmentProgress.rows.length > 0) {
      console.log('\n📅 Last 7 Days Progress:');
      enrichmentProgress.rows.forEach(row => {
        const date = new Date(row.date).toLocaleDateString();
        const total = parseInt(row.with_details) + parseInt(row.without_details);
        const percent = total > 0 ? Math.round((parseInt(row.with_details) / total) * 100) : 0;
        console.log(`${date}: ${row.with_details}/${total} enriched (${percent}%)`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    if (db.pool) {
      await db.pool.end();
    }
  }
}

// Add command line options
const args = process.argv.slice(2);
if (args.includes('--watch')) {
  // Monitor continuously
  console.log('Running in watch mode (updates every 30 seconds)...\n');
  
  const runMonitor = async () => {
    console.clear();
    await monitorEnrichment();
  };
  
  runMonitor();
  setInterval(runMonitor, 30000);
} else {
  // Run once
  monitorEnrichment();
}