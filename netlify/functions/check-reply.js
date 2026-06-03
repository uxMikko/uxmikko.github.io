const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': 'https://uxmikko.netlify.app',
  };

  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const sessionId = event.queryStringParameters?.sessionId;
  if (!sessionId) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'sessionId required' }) };
  }

  try {
    const store = getStore('chat-replies');
    const reply = await store.get(`reply:${sessionId}`);

    if (reply !== null) {
      await store.delete(`reply:${sessionId}`).catch(() => {});
      return { statusCode: 200, headers, body: JSON.stringify({ answered: true, reply }) };
    }

    return { statusCode: 200, headers, body: JSON.stringify({ answered: false }) };
  } catch (err) {
    console.error('check-reply error:', err);
    return { statusCode: 200, headers, body: JSON.stringify({ answered: false }) };
  }
};
