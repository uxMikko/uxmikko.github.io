const NOTION_TOKEN    = process.env.NOTION_TOKEN;
const NOTION_DB_ID    = '58293698-6688-4be7-b6e8-8ac71d45ed40'; // question log
const NOTION_KB_DB_ID = 'e3529e51-cfdd-47d3-8557-95b811a8fa5b'; // knowledge base
const CHAT_ADMIN_KEY  = process.env.CHAT_ADMIN_KEY;

const MAX_HISTORY    = 8;
const ALLOWED_ORIGIN = 'https://uxmikko.netlify.app';

// ── In-memory KB cache (lives for the function instance lifetime) ──────────
let kbCache    = null;
let kbCacheAt  = 0;
const KB_TTL   = 5 * 60 * 1000; // 5 min

async function fetchKB() {
  if (kbCache !== null && Date.now() - kbCacheAt < KB_TTL) return kbCache;
  if (!NOTION_TOKEN) return '';
  try {
    const res = await fetch(`https://api.notion.com/v1/databases/${NOTION_KB_DB_ID}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NOTION_TOKEN}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ filter: { property: 'Active', checkbox: { equals: true } } }),
    });
    if (!res.ok) return kbCache || '';
    const data = await res.json();
    const items = (data.results || [])
      .map(r => r.properties?.Correction?.title?.[0]?.text?.content)
      .filter(Boolean);
    kbCache   = items.length ? `\n\nCorrected facts (these override everything above):\n- ${items.join('\n- ')}` : '';
    kbCacheAt = Date.now();
    return kbCache;
  } catch (e) {
    console.error('KB fetch:', e);
    return kbCache || '';
  }
}

async function saveToKB(correction) {
  if (!NOTION_TOKEN) return false;
  try {
    const res = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${NOTION_TOKEN}`,
        'Notion-Version': '2022-06-28',
      },
      body: JSON.stringify({
        parent: { database_id: NOTION_KB_DB_ID },
        properties: {
          Correction: { title: [{ text: { content: correction.slice(0, 2000) } }] },
          Active:     { checkbox: true },
        },
      }),
    });
    if (res.ok) kbCache = null; // invalidate cache so next request picks it up
    return res.ok;
  } catch (e) {
    console.error('KB save:', e);
    return false;
  }
}

// ── Page-aware context ─────────────────────────────────────────────────────
const PAGE_CONTEXT = {
  '/basf/': {
    name: 'BASF',
    focus: 'merging three internal developer platforms (Argus, Data Science Platform, AppStore) into one unified portal called DevHub. Key themes: IA over UI, aligning three product owners, feature parity for developers, data scientists, and novice users.',
    others: [
      { name: 'GENSAM (COVID sequencing platform)', url: 'https://uxmikko.netlify.app/gensam/' },
      { name: 'LTN (nicotine product registration)', url: 'https://uxmikko.netlify.app/ltn/' },
    ],
  },
  '/svebar/': {
    name: 'SVEBar',
    focus: 'redesigning Sweden\'s national bacteria outbreak monitoring system. Key themes: restoring trust in alerts, making monitoring configurations visible, synonym management redesign.',
    others: [
      { name: 'GENSAM (COVID sequencing platform)', url: 'https://uxmikko.netlify.app/gensam/' },
      { name: 'FASS (pharmaceuticals portal)', url: 'https://uxmikko.netlify.app/fass/' },
    ],
  },
  '/gensam/': {
    name: 'GENSAM',
    focus: 'redesigning a bare-bones COVID genomic sequencing data portal. Key themes: multi-lab workflow, SMiNet registry matching, deposition-first upload flow, paired-end sequencing UI, timeline architecture.',
    others: [
      { name: 'SVEBar (bacteria monitoring)', url: 'https://uxmikko.netlify.app/svebar/' },
      { name: 'BASF (developer platform merger)', url: 'https://uxmikko.netlify.app/basf/' },
    ],
  },
  '/fass/': {
    name: 'FASS',
    focus: 'redesigning Sweden\'s pharmaceutical catalogue used daily by clinicians and pharmacists. Key themes: persistent settings, simplified TTS pronunciation flow, clinical collaboration.',
    others: [
      { name: 'SVEBar (bacteria monitoring)', url: 'https://uxmikko.netlify.app/svebar/' },
      { name: 'LTN (government compliance portal)', url: 'https://uxmikko.netlify.app/ltn/' },
    ],
  },
  '/ltn/': {
    name: 'LTN',
    focus: 'building a nicotine product registration portal under a hard government deadline with no user research allowed. Key themes: designing for everyone from a one-person vape shop to Phillip Morris, ingredient validation with fraud flagging, agile sign-off process.',
    others: [
      { name: 'BASF (enterprise developer tools)', url: 'https://uxmikko.netlify.app/basf/' },
      { name: 'Riksbyggen (subscription platform)', url: 'https://uxmikko.netlify.app/riksbyggen/' },
    ],
  },
  '/riksbyggen/': {
    name: 'Riksbyggen',
    focus: 'automating subscription sales for 900 tenant organisations. Key themes: three-system integration (billing, CRM, client portal), slim MVP via card sorting, 500 subscribers in under 2 months.',
    others: [
      { name: 'BASF (complex B2B platform)', url: 'https://uxmikko.netlify.app/basf/' },
      { name: 'LTN (government compliance portal)', url: 'https://uxmikko.netlify.app/ltn/' },
    ],
  },
};

function buildPageContext(page) {
  const ctx = PAGE_CONTEXT[page];
  if (!ctx) return '';
  const othersText = ctx.others
    .map(o => `  - ${o.name}: ${o.url}`)
    .join('\n');
  return `\n\nPage context: The recruiter is currently viewing the ${ctx.name} case study. Focus your answers on this project where relevant. Key details: ${ctx.focus}\n\nIf they ask about something better covered by another case study, mention it and include the link:\n${othersText}`;
}

// ── Base system prompt ─────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are Mikko's AI clone on his portfolio site. Answer questions about him as if you are him — use first person, keep it short and human. No corporate language, no long paragraphs. One or two sentences is usually enough.

STRICT RULE: You may ONLY use information explicitly written in this system prompt. Do not draw on your training data, do not infer, do not guess, do not extrapolate. If something is not stated here, you do not know it. Say so honestly.

About me: I'm Mikko, a senior product designer based in Barcelona. Finnish originally. I've spent 5 years designing complex B2B products — public health platforms, government tools, developer portals, healthcare. Currently looking for my next role — senior or staff product design, open to remote or relocation.

My work: BASF (merging three developer platforms), FASS (pharmaceuticals portal), SVEBar and GENSAM for the Swedish Public Health Agency (bacteria monitoring and COVID sequencing), LTN (nicotine product registration portal under a legal deadline), Riksbyggen (subscription platform, 500 subscribers in 2 months).

My approach: I start with how people actually work, not with how things look. I like working with expert users — scientists, clinicians, developers — who'll notice if you've done it wrong.

If someone asks something not covered here, say you don't have that detail and point them to uxmikko@gmail.com or the contact form. Never speculate. Never make up details. Never discuss salary — that's a real conversation.`;

// ── Uncertain-reply detection ──────────────────────────────────────────────
const UNCERTAIN_PHRASES = [
  "i don't know", "i'm not sure", "not sure", "ask me directly",
  "reach out", "contact me", "get in touch", "email me",
  "don't have that", "not covered", "no detail",
];
function botIsUncertain(text) {
  const l = text.toLowerCase();
  return UNCERTAIN_PHRASES.some(p => l.includes(p));
}

// ── Notion question log ────────────────────────────────────────────────────
async function logToNotion(message, referrer, botAnswered) {
  if (!NOTION_TOKEN) return;
  try {
    await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${NOTION_TOKEN}`,
        'Notion-Version': '2022-06-28',
      },
      body: JSON.stringify({
        parent: { database_id: NOTION_DB_ID },
        properties: {
          Question:      { title: [{ text: { content: message.slice(0, 2000) } }] },
          Page:          { rich_text: [{ text: { content: referrer || 'unknown' } }] },
          'Bot answered':{ checkbox: botAnswered },
          'date:Asked at:start': new Date().toISOString(),
        },
      }),
    });
  } catch (e) {
    console.error('Notion log:', e);
  }
}

// ── Handler ────────────────────────────────────────────────────────────────
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

    // ── Admin auth attempt ───────────────────────────────────────────────
    if (authAttempt) {
      const ok = !!CHAT_ADMIN_KEY && clientKey === CHAT_ADMIN_KEY;
      return {
        statusCode: 200, headers,
        body: JSON.stringify({
          reply: ok
            ? "You're in. Ask anything and correct wrong answers with 'No. [the right answer]'."
            : "That key doesn't match. Try again.",
          authenticated: ok,
        }),
      };
    }

    // ── Correction command ───────────────────────────────────────────────
    if (message && message.startsWith('No. ') && clientKey && clientKey === CHAT_ADMIN_KEY) {
      const correction = message.slice(4).trim();
      if (!correction) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Empty correction.' }) };
      const saved = await saveToKB(correction);
      return {
        statusCode: 200, headers,
        body: JSON.stringify({
          reply: saved
            ? `Saved ✓ — "${correction}". It'll be live in the next response.`
            : "Something went wrong saving that. Try again.",
        }),
      };
    }

    // ── Normal message ───────────────────────────────────────────────────
    if (!message || typeof message !== 'string') {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'message is required' }) };
    }

    const [kb, pageCtx] = await Promise.all([fetchKB(), Promise.resolve(buildPageContext(page || ''))]);
    const fullPrompt = SYSTEM_PROMPT + pageCtx + kb;

    const messages = [
      ...history.filter(m => m.role && m.content).slice(-MAX_HISTORY),
      { role: 'user', content: message.slice(0, 2000) },
    ];

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        system: fullPrompt,
        messages,
      }),
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
      reply += `\n\n[Send me this question directly →](https://uxmikko.netlify.app/#contact?q=${enc})`;
    }

    logToNotion(message, referrer, !uncertain);

    return { statusCode: 200, headers, body: JSON.stringify({ reply }) };

  } catch (err) {
    console.error('Handler error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Something went wrong — please email uxmikko@gmail.com.' }) };
  }
};
