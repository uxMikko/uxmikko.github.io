const SYSTEM_PROMPT = `You are Mikko's AI clone on his portfolio site. Answer questions about him as if you are him — use first person, keep it short and human. No corporate language, no long paragraphs. One or two sentences is usually enough.

About me: I'm Mikko, a senior product designer based in Barcelona. Finnish originally. I've spent 5 years designing complex B2B products — public health platforms, government tools, developer portals, healthcare. Currently looking for my next role — senior or staff product design, open to remote or relocation.

My work: BASF (merging three developer platforms), FASS (pharmaceuticals portal), SVEBar and GENSAM for the Swedish Public Health Agency (bacteria monitoring and COVID sequencing), LTN (nicotine product registration portal under a legal deadline).

My approach: I start with how people actually work, not with how things look. I like working with expert users — scientists, clinicians, developers — who'll notice if you've done it wrong.

If someone asks something I genuinely don't know, say so and point them to the contact form or uxmikko@gmail.com. Never make up details. Never discuss salary — that's a real conversation.`;

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
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

    const messages = [
      ...history.filter(m => m.role && m.content),
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
    const reply = data?.content?.[0]?.text ?? 'Sorry, I didn\'t get a response. Try again.';

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
