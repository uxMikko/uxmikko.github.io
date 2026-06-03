const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  // Telegram sends POST; respond 200 quickly so it doesn't retry
  if (event.httpMethod !== 'POST') {
    return { statusCode: 200, body: 'OK' };
  }

  try {
    const update = JSON.parse(event.body || '{}');
    const msg = update.message;

    // Must be a reply to another message
    if (!msg?.reply_to_message?.text || !msg?.text) {
      return { statusCode: 200, body: 'OK' };
    }

    const originalText = msg.reply_to_message.text;

    // Extract session ID we embedded in the original Telegram message
    const sessionMatch = originalText.match(/\[Session: ([^\]]+)\]/);
    if (!sessionMatch) {
      return { statusCode: 200, body: 'OK' }; // Not one of ours
    }

    const sessionId = sessionMatch[1];
    const humanReply = msg.text.trim();

    // Store reply in Netlify Blobs — check-reply.js will pick it up
    const store = getStore('chat-replies');
    await store.set(`reply:${sessionId}`, humanReply);

    // Also write Q+A to the Notion Corrections Staging DB with Active=true
    // so it's permanently in the KB after Mikko answers it
    const questionMatch = originalText.match(/💬 Live question from portfolio visitor:\n\n"([^"]+)"/s);
    if (questionMatch && process.env.NOTION_TOKEN && process.env.NOTION_KB_DB_ID) {
      const question = questionMatch[1];
      const entry = `Q: ${question}\nA: ${humanReply}`;
      fetch('https://api.notion.com/v1/pages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.NOTION_TOKEN}`,
          'Notion-Version': '2022-06-28',
        },
        body: JSON.stringify({
          parent: { database_id: process.env.NOTION_KB_DB_ID },
          properties: {
            Correction: { title: [{ text: { content: entry.slice(0, 2000) } }] },
            Active:     { checkbox: true }, // Mikko's own answer — goes live immediately
          },
        }),
      }).catch(e => console.error('Notion save after Telegram reply:', e));
    }

    return { statusCode: 200, body: 'OK' };
  } catch (err) {
    console.error('Telegram reply handler error:', err);
    return { statusCode: 200, body: 'OK' }; // Always 200 to stop Telegram retrying
  }
};
