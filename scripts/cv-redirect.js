#!/usr/bin/env node
// Runs at build time. Reads assets/cv/, finds all PDFs, then:
//   1. Writes /cv/download → first PDF into _redirects
//   2. Writes assets/cv/manifest.json with all PDF filenames
// Drop new PDFs in assets/cv/ and redeploy — everything updates automatically.
const fs   = require('fs');
const path = require('path');

const cvDir         = path.join(__dirname, '..', 'assets', 'cv');
const redirectsPath = path.join(__dirname, '..', '_redirects');
const manifestPath  = path.join(cvDir, 'manifest.json');

let pdfs;
try {
  pdfs = fs.readdirSync(cvDir).filter(f => /\.pdf$/i.test(f)).sort();
} catch {
  console.log('[cv-redirect] assets/cv/ not found — skipping.');
  process.exit(0);
}

if (!pdfs.length) {
  console.log('[cv-redirect] No PDFs found in assets/cv/ — skipping.');
  process.exit(0);
}

// 1. Write _redirects — /cv/download points to the first (or only) PDF
const encoded = encodeURIComponent(pdfs[0]);
const rule    = `/cv/download  /assets/cv/${encoded}  200\n`;

let existing = '';
if (fs.existsSync(redirectsPath)) {
  existing = fs.readFileSync(redirectsPath, 'utf8')
    .split('\n')
    .filter(l => !l.startsWith('/cv/download'))
    .join('\n')
    .trimStart();
}
fs.writeFileSync(redirectsPath, rule + (existing ? '\n' + existing : ''));
console.log('[cv-redirect] Redirect written:', rule.trim());

// 2. Write manifest.json so the page can show a dropdown for multiple files
const manifest = { files: pdfs };
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log('[cv-redirect] Manifest written:', pdfs);
