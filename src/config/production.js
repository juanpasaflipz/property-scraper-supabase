export const productionConfig = {
  // Scraping settings
  scraping: {
    maxConcurrentRequests: 2,
    delayBetweenRequests: 3000, // 3 seconds
    maxRetriesPerRequest: 3,
    requestTimeout: 30000,
    userAgents: [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36'
    ]
  },
  
  // Database settings
  database: {
    maxRetries: 5,
    retryDelay: 5000,
    batchSize: 100,
    connectionTimeout: 60000
  },
  
  // Monitoring
  monitoring: {
    logLevel: 'info',
    errorReporting: true,
    metricsEnabled: true
  },
  
  // Rate limiting per source
  rateLimits: {
    mercadolibre: {
      requestsPerMinute: 20,
      requestsPerHour: 500,
      requestsPerDay: 5000
    },
    lamudi: {
      requestsPerMinute: 30,
      requestsPerHour: 800,
      requestsPerDay: 8000
    }
  }
};