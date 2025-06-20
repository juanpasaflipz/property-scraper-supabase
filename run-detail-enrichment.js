import dotenv from 'dotenv';
dotenv.config();

import { DetailScrapingQueue } from './src/services/detail-scraping-queue.js';
import { Logger } from './src/utils/logger.js';

async function runDetailEnrichment() {
  const logger = new Logger('DetailEnrichment');
  const queue = new DetailScrapingQueue();
  
  console.log('🚀 Property Detail Enrichment Process\n');
  console.log('This will fetch detailed information for properties without details.\n');
  
  try {
    // Get initial statistics
    console.log('📊 Getting initial statistics...');
    const beforeStats = await queue.getDetailedPropertyStats();
    
    console.log(`Properties without details: ${beforeStats.without_details}`);
    console.log(`Properties with details: ${beforeStats.with_details}\n`);
    
    if (beforeStats.without_details === 0) {
      console.log('✅ All properties already have details!');
      return;
    }
    
    // Process properties
    console.log('🔄 Starting detail enrichment...');
    console.log('Processing up to 50 properties (to avoid rate limiting)\n');
    
    const startTime = Date.now();
    
    const results = await queue.processQueue({
      limit: 50,
      onlyNew: false  // Process all properties without details
    });
    
    const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(2);
    
    // Display results
    console.log('\n' + '='.repeat(60));
    console.log('📊 ENRICHMENT RESULTS');
    console.log('='.repeat(60));
    
    console.log(`\n✅ Process completed in ${duration} minutes`);
    console.log(`📊 Properties processed: ${results.processed}`);
    console.log(`✅ Successful: ${results.success}`);
    console.log(`❌ Failed: ${results.errors}`);
    
    if (results.success > 0) {
      const successRate = Math.round((results.success / results.processed) * 100);
      console.log(`📈 Success rate: ${successRate}%`);
    }
    
    // Get updated statistics
    console.log('\n📊 Updated Statistics:');
    const afterStats = await queue.getDetailedPropertyStats();
    
    console.log(`- Total properties: ${afterStats.total_properties}`);
    console.log(`- With details: ${afterStats.with_details} (+${afterStats.with_details - beforeStats.with_details})`);
    console.log(`- Without details: ${afterStats.without_details}`);
    console.log(`- Completion: ${Math.round((afterStats.with_details / afterStats.total_properties) * 100)}%`);
    
    // Show sample enriched property
    if (results.details && results.details.length > 0) {
      console.log('\n📋 Sample Enriched Property:');
      const sample = results.details[0];
      console.log(`- ID: ${sample.external_id}`);
      console.log(`- Amenities: ${sample.details.amenities?.length || 0} found`);
      console.log(`- Images: ${sample.details.images?.length || 0} found`);
      console.log(`- Description: ${sample.details.description ? 'Yes' : 'No'}`);
    }
    
    // Get top amenities
    console.log('\n🏆 Top Amenities Found:');
    const topAmenities = await queue.getTopAmenities(15);
    topAmenities.forEach((item, i) => {
      console.log(`${(i + 1).toString().padStart(2)}. ${item.amenity.padEnd(30)} (${item.count} properties)`);
    });
    
    // Recommendations
    console.log('\n💡 Next Steps:');
    if (afterStats.without_details > 0) {
      console.log(`- Run again to process remaining ${afterStats.without_details} properties`);
      console.log('- Consider running during off-peak hours to avoid rate limiting');
    }
    console.log('- Use enriched data for better property filtering and search');
    console.log('- Export detailed properties for analysis');
    
  } catch (error) {
    logger.error('Detail enrichment failed', error);
    console.error('\n❌ Error:', error.message);
  }
}

// Check command line arguments
const args = process.argv.slice(2);
const limit = args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1]) : 50;
const exportData = args.includes('--export');

if (args.includes('--help')) {
  console.log(`
Property Detail Enrichment Tool

Usage: node run-detail-enrichment.js [options]

Options:
  --limit <number>  Number of properties to process (default: 50)
  --export          Export enriched properties to JSON file
  --help            Show this help message

Examples:
  node run-detail-enrichment.js
  node run-detail-enrichment.js --limit 100
  node run-detail-enrichment.js --limit 20 --export
`);
  process.exit(0);
}

// Run enrichment
runDetailEnrichment();