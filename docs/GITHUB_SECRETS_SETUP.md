# GitHub Secrets Configuration Guide

## Required Secrets

### 1. Database Secrets
- `SUPABASE_URL`: Your Supabase project URL
- `SUPABASE_KEY`: Your Supabase anon key (public)
- `SUPABASE_SERVICE_KEY`: Your Supabase service role key (keep very secret!)

### 2. Deployment Secrets (if deploying to VPS)
- `DEPLOY_HOST`: Your server IP or domain (e.g., 165.232.145.23)
- `DEPLOY_USER`: SSH username (e.g., deploy or root)
- `DEPLOY_KEY`: Private SSH key for authentication

### 3. Optional Secrets
- `SCRAPED_API_KEY`: If using Scrape.do
- `SENTRY_DSN`: For error tracking
- `SLACK_WEBHOOK`: For notifications

## How to Add Secrets

### Step 1: Navigate to Settings
1. Go to your GitHub repository
2. Click "Settings" tab
3. In the left sidebar, click "Secrets and variables" → "Actions"

### Step 2: Add Each Secret
1. Click "New repository secret"
2. Enter the secret name (e.g., `SUPABASE_URL`)
3. Enter the secret value
4. Click "Add secret"

### Step 3: Generate SSH Key for Deployment
```bash
# On your local machine
ssh-keygen -t ed25519 -f ~/.ssh/property-scraper-deploy -C "github-actions"

# Copy the private key for DEPLOY_KEY
cat ~/.ssh/property-scraper-deploy

# Copy the public key to add to your server
cat ~/.ssh/property-scraper-deploy.pub
```

### Step 4: Add SSH Key to Server
```bash
# On your production server
mkdir -p ~/.ssh
echo "YOUR_PUBLIC_KEY_HERE" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

## Example GitHub Actions Usage

Your secrets will be available in workflows like this:

```yaml
env:
  SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
  SUPABASE_KEY: ${{ secrets.SUPABASE_KEY }}
```

## Security Best Practices

1. **Never log secrets** in your code
2. **Rotate keys** every 3-6 months
3. **Use least privilege** - only give necessary permissions
4. **Limit secret access** to specific environments
5. **Audit secret usage** regularly

## Testing Your Secrets

Create a test workflow to verify secrets are set correctly:

```yaml
name: Test Secrets
on: workflow_dispatch

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Test Supabase Connection
        run: |
          if [ -z "${{ secrets.SUPABASE_URL }}" ]; then
            echo "❌ SUPABASE_URL is not set"
            exit 1
          else
            echo "✅ SUPABASE_URL is set"
          fi
```