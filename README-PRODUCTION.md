# Production Deployment Guide

## Prerequisites
- Node.js 20+ 
- PM2 for process management
- Docker (optional)
- VPS or Cloud server (AWS/DigitalOcean/etc)

## Quick Start

### 1. Environment Setup
```bash
# Copy and configure production environment
cp .env.example .env.production
nano .env.production
```

### 2. Database Security
```sql
-- Enable RLS on Supabase
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;

-- Create appropriate policies
CREATE POLICY "public_read" ON properties FOR SELECT USING (true);
CREATE POLICY "service_write" ON properties FOR ALL 
  USING (auth.jwt() ->> 'role' = 'service_role');
```

### 3. Deploy with PM2
```bash
# Install PM2 globally
npm install -g pm2

# Start services
pm2 start ecosystem.config.js --env production

# Save PM2 configuration
pm2 save
pm2 startup
```

### 4. Deploy with Docker
```bash
# Build and run
docker-compose up -d

# Check logs
docker-compose logs -f
```

## Monitoring

### Health Checks
```bash
# Manual health check
node scripts/health-check.js

# PM2 monitoring
pm2 monit

# View logs
pm2 logs property-scraper
```

### Metrics to Monitor
- Database connection status
- API response times
- Scraping success rate
- Error rates
- Memory usage

## Security Checklist
- [ ] Environment variables secured
- [ ] Database RLS enabled
- [ ] API keys rotated regularly
- [ ] Rate limiting configured
- [ ] Error logging without sensitive data
- [ ] HTTPS for all endpoints
- [ ] Regular security updates

## Scaling Considerations

### Horizontal Scaling
- Use multiple scraper instances with different IP addresses
- Implement job queue (Redis/RabbitMQ) for distributed scraping
- Load balance requests across instances

### Rate Limiting
- Respect robots.txt
- Implement exponential backoff
- Use rotating user agents
- Consider proxy rotation for high volume

## Backup Strategy
```bash
# Database backup (Supabase handles this)
# But you can also export data:
pg_dump $DATABASE_URL > backup-$(date +%Y%m%d).sql

# Application backup
tar -czf property-scraper-$(date +%Y%m%d).tar.gz .
```

## Troubleshooting

### Common Issues
1. **Rate limiting**: Increase delays, use proxies
2. **Memory leaks**: Monitor with PM2, restart periodically
3. **Database timeouts**: Implement connection pooling
4. **Blocked requests**: Rotate user agents, use residential proxies

### Debug Mode
```bash
# Run with debug logging
NODE_ENV=production DEBUG=* node src/index.js
```

## Maintenance

### Regular Tasks
- Weekly: Check logs for errors
- Monthly: Update dependencies
- Quarterly: Review and optimize queries
- Yearly: Full security audit

### Update Process
```bash
# 1. Test in development
npm test

# 2. Deploy to staging
git push staging main

# 3. Deploy to production
./scripts/deploy.sh
```