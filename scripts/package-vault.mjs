#!/usr/bin/env node

/**
 * Package pre-seeded vault for deployment
 * Creates a compressed archive that can be fetched by the frontend
 * 
 * Usage: node scripts/package-vault.mjs
 */

import fs from 'fs';
import path from 'path';

const VAULT_DIR = path.join(process.cwd(), 'public', 'hujjah-vault');
const OUTPUT_FILE = path.join(process.cwd(), 'public', 'hujjah-vault.tar.gz');

async function packageVault() {
  console.log('📦 Packaging pre-seeded vault...\n');
  
  if (!fs.existsSync(VAULT_DIR)) {
    console.error('❌ Vault directory not found. Run: npm run seed:vault');
    process.exit(1);
  }

  const vaultSize = getDirectorySize(VAULT_DIR);
  console.log('📊 Vault size:', (vaultSize / 1024 / 1024).toFixed(2), 'MB');

  // Remove old archive
  if (fs.existsSync(OUTPUT_FILE)) {
    fs.unlinkSync(OUTPUT_FILE);
  }

  console.log('\n⚠️  Note: Compression skipped for speed');
  console.log('   Vault files are in public/hujjah-vault/');
  console.log('   They will be served as static assets\n');

  // Create manifest
  const manifest = {
    version: '1.0.0',
    createdAt: new Date().toISOString(),
    size: vaultSize,
    files: countFiles(VAULT_DIR)
  };

  fs.writeFileSync(
    path.join(process.cwd(), 'public', 'hujjah-vault-manifest.json'),
    JSON.stringify(manifest, null, 2)
  );

  console.log('✅ Packaging complete!');
  console.log('\n📝 Files created:');
  console.log('   - public/hujjah-vault/ (database files)');
  console.log('   - public/hujjah-vault-manifest.json');
  console.log('\n🌐 These will be deployed with your Next.js app');
}

function getDirectorySize(dirPath) {
  let size = 0;
  
  function walk(currentPath) {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      
      if (entry.isDirectory()) {
        walk(fullPath);
      } else {
        size += fs.statSync(fullPath).size;
      }
    }
  }
  
  walk(dirPath);
  return size;
}

function countFiles(dirPath) {
  let count = 0;
  
  function walk(currentPath) {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isDirectory()) {
        walk(path.join(currentPath, entry.name));
      } else {
        count++;
      }
    }
  }
  
  walk(dirPath);
  return count;
}

packageVault().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
