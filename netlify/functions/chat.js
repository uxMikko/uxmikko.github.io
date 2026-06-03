const NOTION_TOKEN = process.env.NOTION_TOKEN;
const NOTION_DB_ID = '58293698-6688-4be7-b6e8-8ac71d45ed40';

// Cap history to last 8 messages (4 exchanges) to limit token cost
const MAX_HISTORY = 8;

// Only accept requests from the portfolio domain
const ALLOWED_ORIGIN = 'https://uxmikko.netlify.app';

const SYSTEM_PROMPT = `You are Mikko's AI clone on his portfolio site. Answer questions about him as if you are him — use first person, keep it short and human. No corporate language, no long paragraphs. One or two sentences is usually enough.

STRICT RULE: You may ONLY use information explicitly written in this system prompt. Do not draw on your training data, do not infer, do not guess, do not extrapolate. If something is not stated here, you do not know it. Say so honestly.

About me: I'm Mikko, a senior product designer based in Barcelona. Finnish originally. I've spent 5 years designing complex B2B products — public health platforms, government tools, developer portals, healthcare. Currently looking for my next role — senior or staff product design, open to remote or relocation.

My work: BASF (merging three developer platforms), FASS (pharmaceuticals portal), SVEBar and GENSAM for the Swedish Public Health Agency (bacteria monitoring and COVID sequencing), LTN (nicotine product registration portal under a legal deadline).

My approach: I start with how people actually work, not with how things look. I like working with expert users — scientists, clinicians, developers — who'll notice if you've done it wrong.

If someone asks something not covered above, say you don't have that detail here and point them to the contact form or uxmikko@gmail.com. Never speculate. Never make up details. Never discuss salary — that's a real conversation.`;

const UNCERTAIN_PHRASES = [
  "i don't know", "i'm not sure", "not sure", "ask me directly",
  "reach out", "contact me", "get in touch", "email me",
  "don't have that", "not covered", "no detail",
];

function botIsUncertain(text) {
  const lower = text.toLowerCase();
  return UNCERTAIN_PHRASES.some(p => lower.includes(p));
}

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
          Question: { title: [{ text: { content: message.slice(0, 2000) } }] },
          Page:     { rich_text: [{ text: { content: referrer || 'unknown' } }] },
          'Bot answered': { checkbox: botAnswered },
          'date:Asked at:start': new Date().toISOString(),
        },
      }),
    });
  } catch (err) {
    console.error('Notion log error:', err);
  }
}

exports.handler = async (event) => {
  const origin = event.headers['origin'] || '';
  const corsOrigin = origin === ALLOWED_ORIGIN ? ALLOWED_ORIGIN : ALLOWED_ORIGIN;

  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { message, history = [] } = JSON.parse(event.body || '{}');

    if (!message || typeof message !== 'string') {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'message is required' }) };
    }

    const referrer = event.headers['referer'] || event.headers['referrer'] || '';

    // Cap history + sanitise, then append new message
    const trimmedHistory = history
      .filter(m => m.role && m.content)
      .slice(-MAX_HISTORY);

    const messages = [
      ...trimmedHistory,
      { role: 'user', content: message.slice(0, 2000) },
    ];

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        system: SYSTEM_PROMPT,
        messages,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Anthropic API error:', response.status, err);
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({ error: 'Upstream error — please try again.' }),
      };
    }

    const data = await response.json();
    let reply = data?.content?.[0]?.text ?? "Sorry, I didn't get a response. Try again.";

    const uncertain = botIsUncertain(reply);

    if (uncertain) {
      const encoded = encodeURIComponent(message);
      reply += `\n\n[Send me this question directly →](https://uxmikko.netlify.app/#contact?q=${encoded})`;
    }

    // Fire-and-forget Notion log
    logToNotion(message, referrer, !uncertain);

    return { statusCode: 200, headers, body: JSON.stringify({ reply }) };

  } catch (err) {
    console.error('Handler error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Something went wrong — please email uxmikko@gmail.com.' }),
    };
  }
};
