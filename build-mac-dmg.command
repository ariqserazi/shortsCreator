#!/bin/bash
set -e

cd "$(dirname "$0")"

echo
echo "shortsCreator macOS DMG builder"
echo "================================"
echo

if ! command -v npm >/dev/null 2>&1; then
  echo "ERROR: npm was not found."
  echo "Install Node.js LTS from https://nodejs.org/ and run this file again."
  echo
  read -r -p "Press Return to close..."
  exit 1
fi

if [ ! -f "package.json" ]; then
  echo "ERROR: package.json was not found. Run this file from the shortsCreator folder."
  echo
  read -r -p "Press Return to close..."
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install
fi

echo
echo "Building macOS DMG..."
npm run build:mac

echo
echo "Done. Your DMG should be in:"
echo "$(pwd)/dist"
echo
ls -lh dist/*.dmg 2>/dev/null || true
echo

if command -v open >/dev/null 2>&1; then
  open dist
fi

read -r -p "Press Return to close..."
