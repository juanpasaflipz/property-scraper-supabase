import dotenv from 'dotenv';
import { promises as fs } from 'fs';
import path from 'path';

// Load production environment
dotenv.config({ path: '.env.production' });

async function verifyProductionSetup() {
  console.log('🔍 Verifying Production Setup\n');
  
  const checks = {
    environment: [],
    files: [],
    security: [],
    database: []
  };
  
  // Check environment variables
  const requiredEnvVars = [
    'SUPABASE_URL',
    'SUPABASE_KEY',
    'NODE_ENV'
  ];
  
  console.log('1️⃣  Checking Environment Variables:');
  for (const envVar of requiredEnvVars) {
    if (process.env[envVar]) {
      console.log(`  ✅ ${envVar} is set`);
      checks.environment.push({ var: envVar, status: 'set' });
    } else {
      console.log(`  ❌ ${envVar} is NOT set`);
      checks.environment.push({ var: envVar, status: 'missing' });
    }
  }
  
  // Check if using correct keys
  if (process.env.SUPABASE_KEY && process.env.SUPABASE_KEY.includes('anon')) {
    console.log('  ✅ Using anon key (correct for client)');
  }
  
  if (process.env.SUPABASE_SERVICE_KEY && !process.env.SUPABASE_SERVICE_KEY.includes('anon')) {
    console.log('  ✅ Service key appears to be set');
  }
  
  // Check required files
  console.log('\n2️⃣  Checking Required Files:');
  const requiredFiles = [
    '.env.production',
    'ecosystem.config.js',
    'scripts/deploy.sh',
    'scripts/health-check.js',
    'Dockerfile',
    'docker-compose.yml'
  ];
  
  for (const file of requiredFiles) {
    try {
      await fs.access(file);
      console.log(`  ✅ ${file} exists`);
      checks.files.push({ file, status: 'exists' });
    } catch {
      console.log(`  ❌ ${file} NOT found`);
      checks.files.push({ file, status: 'missing' });
    }
  }
  
  // Security checks
  console.log('\n3️⃣  Security Checks:');
  
  // Check if .env.production is in .gitignore
  try {
    const gitignore = await fs.readFile('.gitignore', 'utf8');
    if (gitignore.includes('.env.production')) {
      console.log('  ✅ .env.production is in .gitignore');
      checks.security.push({ check: 'env-gitignore', status: 'secure' });
    } else {
      console.log('  ⚠️  .env.production should be in .gitignore!');
      checks.security.push({ check: 'env-gitignore', status: 'warning' });
    }
  } catch {
    console.log('  ❌ No .gitignore file found');
  }
  
  // Summary
  console.log('\n📊 Summary:');
  const envMissing = checks.environment.filter(c => c.status === 'missing').length;
  const filesMissing = checks.files.filter(c => c.status === 'missing').length;
  
  if (envMissing === 0 && filesMissing === 0) {
    console.log('✅ Production setup looks good!');
  } else {
    console.log(`⚠️  Issues found:`);
    if (envMissing > 0) console.log(`  - ${envMissing} environment variables missing`);
    if (filesMissing > 0) console.log(`  - ${filesMissing} required files missing`);
  }
  
  // Next steps
  console.log('\n📝 Next Steps:');
  console.log('1. Enable RLS in Supabase Dashboard');
  console.log('2. Add secrets to GitHub repository settings');
  console.log('3. Deploy to your production server');
  console.log('4. Run health checks to verify deployment');
}

verifyProductionSetup().catch(console.error);