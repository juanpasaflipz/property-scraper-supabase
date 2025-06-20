import dotenv from 'dotenv';
dotenv.config();

import { Database } from '../src/db/database.js';

async function analyzeOptimalSchedule() {
  const db = new Database();
  
  try {
    await db.connect();
    console.log('📊 Analyzing Optimal Scraping Schedule\n');
    
    // Analyze when properties are listed (by hour)
    const hourlyPattern = await db.query(`
      SELECT 
        EXTRACT(HOUR FROM created_at) as hour,
        COUNT(*) as count
      FROM properties
      WHERE created_at > NOW() - INTERVAL '30 days'
      GROUP BY hour
      ORDER BY hour
    `);
    
    console.log('🕐 New Listings by Hour of Day:');
    hourlyPattern.rows.forEach(row => {
      const bar = '█'.repeat(Math.floor(row.count / 10));
      console.log(`${String(row.hour).padStart(2, '0')}:00 ${bar} (${row.count})`);
    });
    
    // Analyze by day of week
    const dailyPattern = await db.query(`
      SELECT 
        TO_CHAR(created_at, 'Day') as day_name,
        EXTRACT(DOW FROM created_at) as day_num,
        COUNT(*) as count
      FROM properties
      WHERE created_at > NOW() - INTERVAL '30 days'
      GROUP BY day_name, day_num
      ORDER BY day_num
    `);
    
    console.log('\n📅 New Listings by Day of Week:');
    dailyPattern.rows.forEach(row => {
      const bar = '█'.repeat(Math.floor(row.count / 50));
      console.log(`${row.day_name.trim().padEnd(10)} ${bar} (${row.count})`);
    });
    
    // Calculate growth rate
    const growthData = await db.query(`
      SELECT 
        DATE_TRUNC('day', created_at) as date,
        COUNT(*) as new_listings
      FROM properties
      WHERE created_at > NOW() - INTERVAL '14 days'
      GROUP BY date
      ORDER BY date DESC
      LIMIT 14
    `);
    
    console.log('\n📈 Daily New Listings (Last 2 Weeks):');
    growthData.rows.forEach(row => {
      const date = new Date(row.date).toLocaleDateString();
      const bar = '█'.repeat(Math.floor(row.new_listings / 20));
      console.log(`${date} ${bar} (${row.new_listings})`);
    });
    
    // Calculate average time between updates
    const updateFrequency = await db.query(`
      WITH listing_updates AS (
        SELECT 
          external_id,
          updated_at - created_at as time_to_update
        FROM properties
        WHERE updated_at > created_at
      )
      SELECT 
        AVG(EXTRACT(EPOCH FROM time_to_update) / 3600) as avg_hours_to_update,
        MIN(EXTRACT(EPOCH FROM time_to_update) / 3600) as min_hours,
        MAX(EXTRACT(EPOCH FROM time_to_update) / 3600) as max_hours
      FROM listing_updates
    `);
    
    if (updateFrequency.rows[0].avg_hours_to_update) {
      console.log('\n⏱️  Update Frequency Analysis:');
      console.log(`Average time to update: ${Math.round(updateFrequency.rows[0].avg_hours_to_update)} hours`);
      console.log(`Fastest update: ${Math.round(updateFrequency.rows[0].min_hours)} hours`);
      console.log(`Slowest update: ${Math.round(updateFrequency.rows[0].max_hours)} hours`);
    }
    
    // Recommendations
    console.log('\n💡 Schedule Recommendations:');
    
    // Find peak hours
    const peakHours = hourlyPattern.rows
      .sort((a, b) => b.count - a.count)
      .slice(0, 4)
      .map(r => r.hour);
    
    console.log(`\n1. Peak listing hours: ${peakHours.join(', ')}`);
    console.log('   → Schedule runs 1 hour after these times');
    
    // Check weekend activity
    const weekendActivity = dailyPattern.rows
      .filter(r => r.day_num === 0 || r.day_num === 6)
      .reduce((sum, r) => sum + parseInt(r.count), 0);
    
    const weekdayActivity = dailyPattern.rows
      .filter(r => r.day_num >= 1 && r.day_num <= 5)
      .reduce((sum, r) => sum + parseInt(r.count), 0);
    
    const weekendPercent = Math.round(weekendActivity / (weekendActivity + weekdayActivity) * 100);
    
    console.log(`\n2. Weekend activity: ${weekendPercent}% of total`);
    if (weekendPercent < 20) {
      console.log('   → Consider reducing weekend scraping');
    }
    
    // Suggest optimal schedule
    console.log('\n3. Suggested schedules:');
    if (peakHours.length >= 3) {
      const schedule = peakHours.slice(0, 3).map(h => (h + 1) % 24).sort((a, b) => a - b);
      console.log(`   Conservative (3x): 0 ${schedule.join(',')} * * *`);
      console.log(`   Aggressive (6x): 0 */4 * * *`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await db.close();
  }
}

analyzeOptimalSchedule();