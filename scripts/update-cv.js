#!/usr/bin/env node
// Reads the PDF in assets/cv/, extracts structured CV data via Claude Haiku,
// then rewrites the marked sections in cv/index.html.
// Cost: ~$0.001 per run (Haiku pricing). Run via: npm run update-cv
'use strict';

const fs   = require('fs');
const path = require('path');

const CV_DIR   = path.join(__dirname, '..', 'assets', 'cv');
const CV_PAGE  = path.join(__dirname, '..', 'cv', 'index.html');

function h(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Logo lookup ───────────────────────────────────────────────────────────────

const LOGO_MAP = [
  { match: /basf/i,                 file: 'BASF.svg',                   label: null },
  { match: /fass/i,                 file: 'Fass.svg',                   label: null },
  { match: /readspeaker/i,          file: 'Readspeaker.svg',            label: null },
  { match: /folkh/i,                file: 'Folkhalsomyndigheten.svg',    label: 'The Public Health Agency of Sweden' },
  { match: /riksbyggen/i,           file: 'Riksbyggen.svg',             label: null },
  { match: /innorbis/i,             file: 'Innorbis.svg',               label: null },
  { match: /avoy/i,                 file: 'Avoy.svg',                   label: null },
];

function getLogo(company) {
  return LOGO_MAP.find(l => l.match.test(company)) || null;
}

// ── HTML generators ──────────────────────────────────────────────────────────

function renderExperience(data) {
  return data.experience.map(e => {
    const logoEntry = getLogo(e.company);
    const logoHtml = logoEntry
      ? `<div class="cv-entry-logo-bg"><img class="cv-entry-logo" src="/img/logos/${logoEntry.file}" alt="${h(e.company)}"></div>${logoEntry.label ? `\n              <span class="cv-entry-logo-label">${h(logoEntry.label)}</span>` : ''}`
      : h(e.company);
    const bullets = e.bullets.map(b => `              <li>${h(b)}</li>`).join('\n');
    return `        <div class="cv-entry">
          <div class="cv-entry-header">
            <div class="cv-entry-logo-wrap">
              ${logoHtml}
            </div>
            <div class="cv-entry-meta">
              <span class="cv-entry-role">${h(e.role)}</span>
              <span class="cv-entry-date">${h(e.dates)}</span>
            </div>
          </div>
          <ul class="cv-bullets">
${bullets}
          </ul>
        </div>`;
  }).join('\n');
}

function renderSkills(data) {
  const cards = [
    { title: 'Design',           items: data.skills.design },
    { title: 'Research',         items: data.skills.research },
    { title: 'Tools &amp; Technical', items: data.skills.tools_and_technical },
    { title: 'Domains',          items: data.skills.domains },
  ];
  return cards.map(card => {
    const tags = (card.items || []).map(t => `            <span class="cv-tag">${h(t)}</span>`).join('\n');
    return `        <div class="grid-card">
          <p class="grid-card-title">${card.title}</p>
          <div class="cv-tag-cloud">
${tags}
          </div>
        </div>`;
  }).join('\n');
}

function renderLanguages(data) {
  const items = data.languages.map(l =>
    `            <div class="cv-lang-item">
              <span class="cv-lang-name">${h(l.name)}</span>
              <span class="cv-lang-level">${h(l.level)}</span>
            </div>`
  ).join('\n');
  return `          <div class="cv-lang-grid">\n${items}\n          </div>`;
}

function renderEducation(data) {
  return data.education.map(e =>
    `          <div class="cv-edu-entry">
            <span class="cv-edu-degree">${h(e.degree)}</span>
            <span class="cv-edu-school">${h(e.school)}</span>
            <span class="cv-edu-years">${h(e.years)}</span>
          </div>`
  ).join('\n');
}

// ── Replace a marked section in the HTML ─────────────────────────────────────

function replaceSection(html, section, content) {
  const start = `<!-- CV-AUTO:${section} -->`;
  const end   = `<!-- /CV-AUTO:${section} -->`;
  const idx1  = html.indexOf(start);
  const idx2  = html.indexOf(end);
  if (idx1 === -1 || idx2 === -1) {
    console.warn(`[update-cv] Warning: markers for "${section}" not found — skipping.`);
    return html;
  }
  return html.slice(0, idx1 + start.length) + '\n' + content + '\n          ' + html.slice(idx2);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const Anthropic = require('@anthropic-ai/sdk');
  const pdfParse  = require('pdf-parse');

  // 1. Find PDF
  let pdfs;
  try {
    pdfs = fs.readdirSync(CV_DIR).filter(f => /\.pdf$/i.test(f)).sort();
  } catch {
    console.error('[update-cv] assets/cv/ not found.');
    process.exit(1);
  }
  if (!pdfs.length) { console.log('[update-cv] No PDF in assets/cv/ — nothing to do.'); return; }

  const pdfPath = path.join(CV_DIR, pdfs[0]);
  console.log(`[update-cv] Reading: ${pdfs[0]}`);

  // 2. Extract text
  const buffer = fs.readFileSync(pdfPath);
  const { text } = await pdfParse(buffer);
  if (!text.trim()) { console.error('[update-cv] PDF has no extractable text (scanned image?).'); process.exit(1); }

  // 3. Parse with Claude Haiku
  const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

  const schema = {
    profile: "One paragraph summary",
    experience: [{ role: "", company: "", dates: "", bullets: [""] }],
    skills: { design: [], research: [], tools_and_technical: [], domains: [] },
    languages: [{ name: "", level: "" }],
    education: [{ degree: "", school: "", years: "" }]
  };

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: `Extract this CV into JSON matching exactly this structure. Return ONLY valid JSON, no markdown, no explanation:\n\n${JSON.stringify(schema, null, 2)}\n\nCV text:\n${text}`
    }]
  });

  // 4. Parse response
  let raw = response.content[0].text.trim();
  // Strip markdown code fences if present
  raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    console.error('[update-cv] Failed to parse Claude response as JSON:\n', raw);
    process.exit(1);
  }

  console.log('[update-cv] Parsed CV data — updating HTML sections...');

  // 5. Update HTML
  let html = fs.readFileSync(CV_PAGE, 'utf8');

  html = replaceSection(html, 'experience', renderExperience(data));
  html = replaceSection(html, 'skills',     renderSkills(data));
  html = replaceSection(html, 'languages',  renderLanguages(data));
  html = replaceSection(html, 'education',  renderEducation(data));

  fs.writeFileSync(CV_PAGE, html);
  console.log('[update-cv] cv/index.html updated successfully.');
}

main().catch(err => { console.error('[update-cv] Error:', err.message); process.exit(1); });
