const NOTION_TOKEN     = process.env.NOTION_TOKEN;
const NOTION_QL_ID     = process.env.NOTION_QL_ID;       // question log
const NOTION_KB_DB_ID  = process.env.NOTION_KB_DB_ID;    // corrections staging db
const NOTION_KB_PAGE_ID = process.env.NOTION_KB_PAGE_ID; // primary KB page
const CHAT_ADMIN_KEY   = process.env.CHAT_ADMIN_KEY;

const VIP_IPS = {
  '123.456.789.0': 'Hey [friend name]! 👋',
  '987.654.321.0': 'Hi [other friend]!',
};

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
  // Handle trailing slash variations (/basf and /basf/ both match)
  const normalised = page.endsWith('/') ? page : page + '/';
  const ctx = PAGE_CONTEXT[normalised] || PAGE_CONTEXT[page];
  if (!ctx) return '';
  return `\n\nCURRENT PAGE: ${ctx.name} case study. INSTRUCTION: Answer specifically about the ${ctx.name} project (${ctx.focus}). Do not give generic answers — the visitor is here because they want to know about this specific work.`;
}

// ── Telegram human-in-the-loop alert ────────────────────────────────────────
async function alertTelegram(question, sessionId) {
  const token  = process.env.TELEGRAM_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.log('Telegram: missing TOKEN or CHAT_ID');
    return;
  }
  const text = `💬 Live question from portfolio visitor:\n\n"${question}"\n\n[Session: ${sessionId}]\n\nReply to this message within 2 minutes to answer them directly.`;
  try {
    const res  = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: parseInt(chatId, 10) || chatId, text }),
    });
    const body = await res.json();
    if (!res.ok) {
      console.error('Telegram API error:', res.status, JSON.stringify(body));
    } else {
      console.log('Telegram sent OK, message_id:', body?.result?.message_id);
    }
  } catch (e) { console.error('Telegram fetch error:', e.message); }
}

// ── Slim base prompt — content comes from the KB page ───────────────────────
const SYSTEM_PROMPT = `You are Mikko's AI clone on his portfolio site. Speak as Mikko in first person. Keep it short — one or two sentences is usually enough. No corporate language.

CRITICAL: You have NO knowledge of Mikko beyond what is written in the knowledge base below. Never infer, guess, or draw on general knowledge about him. If something is not explicitly in the knowledge base — personal life, opinions, hobbies, relationships, children, daily routine, anything — you do not know it. In that case you MUST respond with "I'm not sure about that one" and offer the contact form. Never make up a plausible-sounding answer. Never discuss salary. Always say 'The Public Health Agency of Sweden' — never use the Swedish name. When sharing a project contact, always format as: [Full Name — Role · Company](linkedin_url) — for Public Health Agency contacts use FoHM as company. When your answer spans more than one paragraph, separate each paragraph with a blank line (two newlines). Never run paragraphs together. Keep answers short — two to four sentences maximum per paragraph, never more.

Language rules — this is strict. Detect the language of the user's message. The ONLY languages I speak are: Swedish, English, Spanish, Danish, Norwegian, Catalan, German, Italian, French. Every other language — including Finnish, Portuguese, Dutch, Polish, Russian, Chinese, Japanese, Arabic, Turkish, and all others not on that list — I do not speak.

- Swedish, English, Spanish: answer fully in that language
- Danish, Norwegian, Catalan: answer in that language, add one brief note that it is not my strongest
- German, Italian, French: answer in that language, note briefly that my [language] is pretty basic
- Any language NOT in the list above: your entire response must be ONE sentence only in that language saying you don't speak it. Do not answer the question. Do not write anything in English. Do not add explanations. One sentence, that language, nothing else. Finnish is NOT on the list. Portuguese is NOT on the list. Dutch is NOT on the list.

When a user asks about specific skills, industries, tools, or types of work — or asks what other case studies exist — suggest the relevant ones using this exact markdown format: [Title — one-line descriptor](/path/). Only suggest case studies that are currently published (listed below). Never link to SVEBar or FASS — those are real projects but I haven't published a case study for them yet. If someone asks about them specifically, acknowledge the work exists but say I haven't written it up as a case study yet. Published case studies:
- [BASF — Merging Three Developer Platforms](/basf/) — enterprise UX, B2B SaaS, platform consolidation, developer tools, complex systems
- [GENSAM — COVID Sequencing Data Platform](/gensam/) — healthcare, genomics, bioinformatics, data-heavy workflows, public health
- [LTN — Nicotine Product Registration Portal](/ltn/) — government, public health, regulatory compliance, form design
- [Riksbyggen — Digital Services Subscription](/riksbyggen/) — housing, consumer apps, subscription model, digital transformation`;

// ── Uncertain-reply detection ────────────────────────────────────────────────
const UNCERTAIN = ["i don't know","i'm not sure","not sure about that","ask me directly","reach out","contact me","get in touch","email me","don't have that","not covered","no detail","knowledge base","haven't covered","can't find","better to ask","don't have details","uxmikko@gmail","contact form","reach mikko","ask mikko","not something i","that's not something","haven't written","not in my","don't have info","not sure i","can't answer"];
const botIsUncertain = t => UNCERTAIN.some(p => t.toLowerCase().includes(p));

// ── Log every question to Notion (question, reply, page, country, IP) ─────────
async function logQuestion(message, reply, referrer, country, ip, botAnswered) {
  if (!NOTION_TOKEN || !NOTION_QL_ID) return;
  try {
    await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${NOTION_TOKEN}`, 'Notion-Version': '2022-06-28' },
      body: JSON.stringify({
        parent: { database_id: NOTION_QL_ID },
        properties: {
          Question:            { title:     [{ text: { content: message.slice(0, 2000) } }] },
          Reply:               { rich_text: [{ text: { content: (reply || '').slice(0, 2000) } }] },
          Page:                { rich_text: [{ text: { content: referrer || 'unknown' } }] },
          Country:             { rich_text: [{ text: { content: country  || 'unknown' } }] },
          IP:                  { rich_text: [{ text: { content: ip       || 'unknown' } }] },
          'Bot answered':      { checkbox: botAnswered },
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
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const body = JSON.parse(event.body || '{}');
    const { message, history = [], authAttempt, adminKey: clientKey, page } = body;
    const referrer = event.headers['referer'] || event.headers['referrer'] || page || '';

    // Visitor metadata
    const forwarded   = event.headers['x-forwarded-for'] || '';
    const clientIP    = forwarded.split(',')[0].trim();
    const country     = event.headers['x-country'] || event.headers['cf-ipcountry'] || 'unknown';
    const vipGreeting = VIP_IPS[clientIP] || null;

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
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 512, system: fullPrompt, messages }),
    });

    if (!res.ok) {
      console.error('Anthropic error:', res.status, await res.text());
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Upstream error — please try again.' }) };
    }

    const data  = await res.json();
    let   reply = data?.content?.[0]?.text ?? "Sorry, I didn't get a response. Try again.";

    // Prepend VIP greeting on the first message of the session
    if (vipGreeting && history.length === 0) {
      reply = vipGreeting + ' ' + reply;
    }

    const uncertain = botIsUncertain(reply);
    // Log every conversation — question, reply, page, country, IP
    logQuestion(message, reply, referrer, country, clientIP, !uncertain);

    let sessionId = null;
    if (uncertain) {
      sessionId = Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
      alertTelegram(message, sessionId); // fire-and-forget
    }

    return { statusCode: 200, headers, body: JSON.stringify({ reply, ...(sessionId && { sessionId }) }) };

  } catch (err) {
    console.error('Handler error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Something went wrong — please email uxmikko@gmail.com.' }) };
  }
};
