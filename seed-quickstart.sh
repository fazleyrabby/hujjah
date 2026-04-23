#!/bin/bash

# Hujjah Pre-Seeding Quick Start
# This script automates the entire seeding process

set -e  # Exit on error

echo "🕌 Hujjah Pre-Seeding Quick Start"
echo "=================================="
echo ""

# Check Node.js version
NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js 18 or higher is required"
    echo "   Current version: $(node --version)"
    exit 1
fi

echo "✅ Node.js version: $(node --version)"

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo ""
    echo "📦 Installing dependencies..."
    npm install
fi

# Check if source files exist
SANADSET_PATH="/Users/rabbi/Desktop/hujjah resources/Sanadset 650K Data on Hadith Narrators/sanadset.csv"
BOOKS_PATH="/Users/rabbi/Desktop/hujjah resources/Sanadset 650K Data on Hadith Narrators/books.csv"

if [ ! -f "$SANADSET_PATH" ]; then
    echo ""
    echo "❌ Sanadset CSV not found at: $SANADSET_PATH"
    echo "   Please update the path in scripts/seed-vault.ts"
    exit 1
fi

if [ ! -f "$BOOKS_PATH" ]; then
    echo ""
    echo "❌ Books CSV not found at: $BOOKS_PATH"
    echo "   Please update the path in scripts/seed-vault.ts"
    exit 1
fi

echo "✅ Source files found"

# Check if vault already exists
if [ -d "public/hujjah-vault" ] && [ -f "public/hujjah-vault.tar.gz" ]; then
    echo ""
    echo "⚠️  Vault already exists!"
    echo "   Location: public/hujjah-vault"
    echo ""
    read -p "Do you want to rebuild? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "✅ Using existing vault"
        echo ""
        echo "Next steps:"
        echo "  1. npm run build"
        echo "  2. npm run start"
        exit 0
    fi
fi

# Run seeding
echo ""
echo "🚀 Starting full seeding process..."
echo "   This will take 10-20 minutes..."
echo ""

npm run seed:full

# Verify
echo ""
echo "✅ Seeding complete!"
echo ""

if [ -f "public/hujjah-vault-manifest.json" ]; then
    echo "📊 Vault Statistics:"
    cat public/hujjah-vault-manifest.json | grep -E '"(size|compressedSize|files)"'
    echo ""
fi

echo "🎉 Success! Your pre-seeded vault is ready."
echo ""
echo "Next steps:"
echo "  1. npm run build"
echo "  2. npm run start"
echo "  3. Open http://localhost:3000"
echo ""
echo "The database will load automatically with ~672K hadith records."
