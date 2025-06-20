module.exports = {
  apps: [{
    name: 'property-scraper',
    script: './src/index.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'development'
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true
  }, {
    name: 'scraper-cron',
    script: './src/services/automated-scraper.js',
    instances: 1,
    autorestart: true,
    watch: false,
    cron_restart: '0 6,18 * * *', // Run at 6 AM and 6 PM daily
    env_production: {
      NODE_ENV: 'production'
    }
  }, {
    name: 'detail-enrichment',
    script: './src/services/detail-enrichment-service.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'development',
      DETAIL_ENRICHMENT_INTERVAL: '120' // Every 2 hours in dev
    },
    env_production: {
      NODE_ENV: 'production',
      DETAIL_ENRICHMENT_INTERVAL: '60' // Every hour in production
    },
    error_file: './logs/detail-enrichment-err.log',
    out_file: './logs/detail-enrichment-out.log',
    time: true
  }]
};