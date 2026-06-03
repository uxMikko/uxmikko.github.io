const NOTION_TOKEN     = process.env.NOTION_TOKEN;
const NOTION_QL_ID     = process.env.NOTION_QL_ID;       // question log
const NOTION_KB_DB_ID  = process.env.NOTION_KB_DB_ID;    // corrections staging db
const NOTION_KB_PAGE_ID = process.env.NOTION_KB_PAGE_ID; // primary KB page
const CHAT_ADMIN_KEY   = process.env.CHAT_ADMIN_KEY;

const MAX_HISTORY    = 8;
const ALLOWED_ORIGIN = 'https://uxmikko.netlify.app';
const KB_TTL         = 5 * 60 * 1000; // 5 min cache

// ── In-memory caches ────────────────────────────────────────────────────────
let pageCache   = null; let pageCacheAt  = 0;
let corCache    = null; let corCacheAt   = 0;

// ── Fetch the primary KB Notion page (blocks → plain text) ──────────────────
function blockText(block) {
  const type = block.type;
  const c    = block[type];
  if (!c?.rich_text) return '';
  const t = c.rich_text.map(r => r.plain_text).join('');
  if (!t.trim()) return '';
  switch (type) {
    case 'heading_1': return `\n# ${t}`;
    case 'heading_2': return `\n## ${t}`;
    case 'heading_3': return `\n### ${t}`;
    case 'bulleted_list_item': return `- ${t}`;
    case 'numbered_list_item': return `${t}`;
    case 'quote': return `> ${t}`;
    case 'divider': return '\n---';
    default: return t;
  }
}

async function fetchKBPage() {
  if (pageCache !== null && Date.now() - pageCacheAt < KB_TTL) return pageCache;
  if (!NOTION_TOKEN || !NOTION_KB_PAGE_ID) return '';
  try {
    let text = '';
    let cursor;
    do {
      const url = `https://api.notion.com/v1/blocks/${NOTION_KB_PAGE_ID}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ''}`;
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${NOTION_TOKEN}`, 'Notion-Version': '2022-06-28' },
      });
      if (!res.ok) break;
      const data = await res.json();
      text   += (data.results || []).map(blockText).filter(Boolean).join('\n');
      cursor  = data.has_more ? data.next_cursor : null;
    } while (cursor);
    pageCache = text; pageCacheAt = Date.now();
    return pageCache;
  } catch (e) {
    console.error('KB page fetch:', e);
    return pageCache || '';
  }
}

// ── Fetch active corrections from the staging DB ────────────────────────────
async function fetchCorrections() {
  if (corCache !== null && Date.now() - corCacheAt < KB_TTL) return corCache;
  if (!NOTION_TOKEN || !NOTION_KB_DB_ID) return '';
  try {
    const res = await fetch(`https://api.notion.com/v1/databases/${NOTION_KB_DB_ID}/query`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
      body: JSON.stringify({ filter: { property: 'Active', checkbox: { equals: true } } }),
    });
    if (!res.ok) return corCache || '';
    const data = await res.json();
    const items = (data.results || [])
      .map(r => r.properties?.Correction?.title?.[0]?.text?.content)
      .filter(Boolean);
    corCache = items.length ? items.join('\n- ') : '';
    corCacheAt = Date.now();
    return corCache;
  } catch (e) {
    console.error('Corrections fetch:', e);
    return corCache || '';
  }
}

// ── Save a correction to the staging DB (needs Active checked to go live) ───
async function saveCorrection(text) {
  if (!NOTION_TOKEN || !NOTION_KB_DB_ID) return false;
  try {
    const res = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${NOTION_TOKEN}`, 'Notion-Version': '2022-06-28' },
      body: JSON.stringify({
        parent: { database_id: NOTION_KB_DB_ID },
        properties: {
          Correction: { title: [{ text: { content: text.slice(0, 2000) } }] },
          Active:     { checkbox: false }, // needs manual review before going live
        },
      }),
    });
    if (res.ok) corCache = null;
    return res.ok;
  } catch (e) {
    console.error('Correction save:', e);
    return false;
  }
}

// ── Page-aware context ───────────────────────────────────────────────────────
const PAGE_CONTEXT = {
  '/basf/':      { name: 'BASF',       focus: 'merging three developer platforms (Argus, DSP, AppStore) into DevHub' },
  '/svebar/':    { name: 'SVEBar',     focus: 'redesigning the national bacteria outbreak monitoring system' },
  '/gensam/':    { name: 'GENSAM',     focus: 'redesigning the COVID genomic sequencing data platform' },
  '/fass/':      { name: 'FASS',       focus: 'redesigning the Swedish pharmaceuticals portal' },
  '/ltn/':       { name: 'LTN',        focus: 'building the nicotine product registration portal under a legal deadline' },
  '/riksbyggen/':{ name: 'Riksbyggen', focus: 'automating subscription sales for 900 tenant organisations' },
};

function buildPageContext(page) {
  const ctx = PAGE_CONTEXT[page];
  if (!ctx) return '';
  return `\n\nThe recruiter is currently reading the ${ctx.name} case study (${ctx.focus}). Lead with details about that project when relevant.`;
}

// ── Slim base prompt — content comes from the KB page ───────────────────────
const SYSTEM_PROMPT = `You are Mikko's AI clone on his portfolio site. Speak as Mikko in first person. Keep it short — one or two sentences is usually enough. No corporate language. Use ONLY the information in the knowledge base below. If something isn't there, say so honestly and point to the contact form or uxmikko@gmail.com. Never discuss salary.`;

// ── Uncertain-reply detection ────────────────────────────────────────────────
const UNCERTAIN = ["i don't know","i'm not sure","not sure","ask me directly","reach out","contact me","get in touch","email me","don't have that","not covered","no detail","knowledge base","haven't covered","can't find","better to ask","don't have details","uxmikko@gmail","contact form","reach mikko","ask mikko"];
const botIsUncertain = t => UNCERTAIN.some(p => t.toLowerCase().includes(p));

// ── Log question to Notion ───────────────────────────────────────────────────
async function logQuestion(message, referrer, botAnswered) {
  if (!NOTION_TOKEN || !NOTION_QL_ID) return;
  try {
    await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${NOTION_TOKEN}`, 'Notion-Version': '2022-06-28' },
      body: JSON.stringify({
        parent: { database_id: NOTION_QL_ID },
        properties: {
          Question:       { title: [{ text: { content: message.slice(0, 2000) } }] },
          Page:           { rich_text: [{ text: { content: referrer || 'unknown' } }] },
          'Bot answered': { checkbox: botAnswered },
          'date:Asked at:start': new Date().toISOString(),
        },
      }),
    });
  } catch (e) { console.error('Log question:', e); }
}

// ── Handler ──────────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const body = JSON.parse(event.body || '{}');
    const { message, history = [], authAttempt, adminKey: clientKey, page } = body;
    const referrer = event.headers['referer'] || event.headers['referrer'] || page || '';

    // Admin auth
    if (authAttempt) {
      const ok = !!CHAT_ADMIN_KEY && clientKey === CHAT_ADMIN_KEY;
      return { statusCode: 200, headers, body: JSON.stringify({
        reply: ok ? "You're in. Ask anything and add corrections with 'No. [the right answer]' — they'll go into the staging database for your review before going live." : "That key doesn't match.",
        authenticated: ok,
      })};
    }

    // Correction command — saved as inactive (needs manual review)
    if (message && message.startsWith('No. ') && clientKey && clientKey === CHAT_ADMIN_KEY) {
      const correction = message.slice(4).trim();
      if (!correction) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Empty correction.' }) };
      const saved = await saveCorrection(correction);
      return { statusCode: 200, headers, body: JSON.stringify({
        reply: saved
          ? `Saved to staging ✓ — "${correction}". Check it in Notion and tick Active when you're happy with it.`
          : "Something went wrong saving that. Try again.",
      })};
    }

    if (!message || typeof message !== 'string') {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'message is required' }) };
    }

    // Build full prompt: base + KB page + active corrections + page context
    const [kbPage, corrections] = await Promise.all([fetchKBPage(), fetchCorrections()]);
    const pageCtx = buildPageContext(page || '');
    let fullPrompt = SYSTEM_PROMPT;
    if (kbPage)      fullPrompt += `\n\nKNOWLEDGE BASE:\n${kbPage}`;
    if (pageCtx)     fullPrompt += pageCtx;
    if (corrections) fullPrompt += `\n\nActive corrections (these override the knowledge base):\n- ${corrections}`;

    const messages = [
      ...history.filter(m => m.role && m.content).slice(-MAX_HISTORY),
      { role: 'user', content: message.slice(0, 2000) },
    ];

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 512, system: fullPrompt, messages }),
    });

    if (!res.ok) {
      console.error('Anthropic error:', res.status, await res.text());
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Upstream error — please try again.' }) };
    }

    const data  = await res.json();
    let   reply = data?.content?.[0]?.text ?? "Sorry, I didn't get a response. Try again.";

    const uncertain = botIsUncertain(reply);
    if (uncertain) {
      const enc = encodeURIComponent(message);
      reply += `\n\n[Send me this question directly →](https://uxmikko.netlify.app/?q=${enc}#contact)`;
    }

    logQuestion(message, referrer, !uncertain);
    return { statusCode: 200, headers, body: JSON.stringify({ reply }) };

  } catch (err) {
    console.error('Handler error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Something went wrong — please email uxmikko@gmail.com.' }) };
  }
};
