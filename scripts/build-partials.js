#!/usr/bin/env node
// Stamps shared HTML partials (e.g. _partials/nav.html) into each page between
// <!-- PARTIAL:name ... --> / <!-- /PARTIAL:name --> markers. Pages stay fully
// static after this runs — no runtime include, no JS dependency.
// Run via: npm run build-partials
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PARTIALS_DIR = path.join(ROOT, '_partials');

const PAGES = [
  'basf/index.html',
  'basf-v2/index.html',
  'fass/index.html',
  'gensam/index.html',
  'ltn/index.html',
  'riksbyggen/index.html',
  'svebar/index.html',
  'cv/index.html',
];

const MARKER_RE = /<!-- PARTIAL:([\w.-]+)((?:\s+[\w-]+="[^"]*")*)\s*-->[\s\S]*?<!-- \/PARTIAL:\1 -->/g;

function parseAttrs(attrStr) {
  const attrs = {};
  const re = /([\w-]+)="([^"]*)"/g;
  let m;
  while ((m = re.exec(attrStr))) attrs[m[1]] = m[2];
  return attrs;
}

let changed = 0;

for (const rel of PAGES) {
  const filePath = path.join(ROOT, rel);
  const src = fs.readFileSync(filePath, 'utf8');

  const out = src.replace(MARKER_RE, (_match, name, attrStr) => {
    const partialPath = path.join(PARTIALS_DIR, name);
    let partial = fs.readFileSync(partialPath, 'utf8');
    const attrs = parseAttrs(attrStr);
    for (const [key, val] of Object.entries(attrs)) {
      partial = partial.split(`{{${key}}}`).join(val);
    }
    return `<!-- PARTIAL:${name}${attrStr} -->\n${partial}<!-- /PARTIAL:${name} -->`;
  });

  if (out !== src) {
    fs.writeFileSync(filePath, out);
    changed++;
    console.log(`updated ${rel}`);
  }
}

console.log(`${changed} file(s) updated.`);
