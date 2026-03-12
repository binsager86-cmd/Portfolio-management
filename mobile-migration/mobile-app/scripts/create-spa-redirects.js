#!/usr/bin/env node
/**
 * create-spa-redirects.js
 *
 * Post-build script for SPA hosting on static platforms (DigitalOcean, GitHub Pages, etc.)
 *
 * Works with both Expo output modes:
 *   - "static" (preferred): Expo generates <route>.html files natively.
 *     This script adds <route>/index.html directories as additional fallback.
 *   - "single": Only index.html exists.
 *     This script copies it to every route path.
 *
 * Also creates 404.html as a fallback for genuinely unknown paths.
 *
 * Usage:  node scripts/create-spa-redirects.js
 */

const fs = require('fs');
const path = require('path');

const DIST = path.resolve(__dirname, '..', 'dist');
const INDEX = path.join(DIST, 'index.html');

// ── All app routes derived from app/(auth)/ and app/(tabs)/ ──────────────
const ROUTES = [
  'login',
  'register',
  '(auth)/login',
  '(auth)/register',
  'holdings',
  'transactions',
  'add-transaction',
  'add-stock',
  'add-deposit',
  'deposits',
  'dividends',
  'settings',
  'backup',
  'portfolio-tracker',
  'portfolio-analysis',
  'fundamental-analysis',
  'securities',
  'trading',
  'planner',
  'pfm',
  'integrity',
  'two',
  'modal',
  '(tabs)',
  '(tabs)/holdings',
  '(tabs)/transactions',
  '(tabs)/add-transaction',
  '(tabs)/add-stock',
  '(tabs)/add-deposit',
  '(tabs)/deposits',
  '(tabs)/dividends',
  '(tabs)/settings',
  '(tabs)/backup',
  '(tabs)/portfolio-tracker',
  '(tabs)/portfolio-analysis',
  '(tabs)/fundamental-analysis',
  '(tabs)/securities',
  '(tabs)/trading',
  '(tabs)/planner',
  '(tabs)/pfm',
  '(tabs)/integrity',
  '(tabs)/two',
  '(tabs)/modal',
];

// ── Main ─────────────────────────────────────────────────────────────────
function main() {
  if (!fs.existsSync(INDEX)) {
    console.error('❌  dist/index.html not found — run expo export first');
    process.exit(1);
  }

  const fallbackHtml = fs.readFileSync(INDEX, 'utf-8');

  // 1. Create 404.html
  const dest404 = path.join(DIST, '404.html');
  fs.writeFileSync(dest404, fallbackHtml);
  console.log('✅  dist/404.html');

  // 2. For each route, ensure both <route>.html and <route>/index.html exist
  let created = 0;
  for (const route of ROUTES) {
    // Determine the best HTML source for this route
    // Prefer the route-specific .html (from output:"static") over generic index.html
    const routeHtmlFile = path.join(DIST, route + '.html');
    const html = fs.existsSync(routeHtmlFile)
      ? fs.readFileSync(routeHtmlFile, 'utf-8')
      : fallbackHtml;

    // Create <route>/index.html (for servers that resolve directories)
    const dir = path.join(DIST, route);
    const dirIndex = path.join(dir, 'index.html');
    if (!fs.existsSync(dirIndex)) {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(dirIndex, html);
      created++;
      console.log(`✅  ${route}/index.html`);
    } else {
      console.log(`⏭   ${route}/index.html (exists)`);
    }

    // Create <route>.html if it doesn't exist (for CDNs with clean-URL support)
    if (!fs.existsSync(routeHtmlFile)) {
      fs.writeFileSync(routeHtmlFile, html);
      created++;
      console.log(`✅  ${route}.html`);
    }
  }

  console.log(`\n🎯  Created ${created} extra route files + 404.html`);
  console.log('    SPA deep links will work on any static host.');
}

main();
