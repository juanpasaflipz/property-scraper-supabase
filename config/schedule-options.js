// Scraping Schedule Options

export const scheduleOptions = {
  // Conservative (1x daily) - Good for starting out
  conservative: {
    cron: '0 3 * * *',  // 3 AM daily
    description: 'Once daily at 3 AM',
    pros: 'Low server load, unlikely to trigger rate limits',
    cons: 'May miss short-lived listings'
  },

  // Standard (2x daily) - Current setting
  standard: {
    cron: '0 6,18 * * *',  // 6 AM and 6 PM
    description: 'Twice daily at 6 AM and 6 PM',
    pros: 'Good balance of freshness and server load',
    cons: 'Still might miss some listings'
  },

  // Frequent (4x daily) - For competitive markets
  frequent: {
    cron: '0 6,12,18,0 * * *',  // Every 6 hours
    description: 'Four times daily (every 6 hours)',
    pros: 'Catches most new listings quickly',
    cons: 'Higher server load, more API calls'
  },

  // Aggressive (6x daily) - Maximum freshness
  aggressive: {
    cron: '0 */4 * * *',  // Every 4 hours
    description: 'Six times daily (every 4 hours)',
    pros: 'Near real-time data updates',
    cons: 'High server load, risk of rate limiting'
  },

  // Business hours only (3x on weekdays)
  businessHours: {
    cron: '0 9,13,17 * * 1-5',  // 9 AM, 1 PM, 5 PM Mon-Fri
    description: 'Three times during business hours on weekdays',
    pros: 'Targets when new listings are most likely posted',
    cons: 'Misses weekend activity'
  },

  // Custom schedules for different sources
  perSource: {
    mercadolibre: '0 6,14,22 * * *',  // 3x daily
    lamudi: '0 8,20 * * *',  // 2x daily
    description: 'Different schedules per source',
    pros: 'Optimized for each platform\'s patterns',
    cons: 'More complex to manage'
  }
};

// Helper to update PM2 config
export function generatePM2Config(schedule) {
  return {
    name: 'scraper-cron',
    script: './src/services/automated-scraper.js',
    cron_restart: schedule,
    instances: 1,
    autorestart: true,
    watch: false,
    env_production: {
      NODE_ENV: 'production'
    }
  };
}