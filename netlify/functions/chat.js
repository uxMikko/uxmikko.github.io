const SYSTEM_PROMPT = `You are a chatbot on Mikko's portfolio at uxmikko.netlify.app. Answer questions about Mikko on his behalf. Be direct, warm and human — no jargon. Speak as Mikko in first person where natural.

About Mikko: Senior product designer, Finnish, based in Barcelona. 5 years experience on complex B2B products — public health platforms, government compliance, developer tools, healthcare. Currently open to senior/staff product design roles globally, available now.

Experience:
- BASF (via Tenth Revolution Group) — merging three internal developer platforms (Argus, Data Science Platform, AppStore) into one unified experience. Ongoing.
- FASS — redesign of Sweden's primary pharmaceutical catalogue used daily by clinicians and pharmacists.
- Folkhälsomyndigheten (Swedish Public Health Agency) — SVEBar: redesigned national bacteria outbreak monitoring system; GENSAM: redesigned COVID genomic sequencing data platform; LTN: built registration portal for tobacco-free nicotine products under a government deadline.
- Riksbyggen — automated subscription sales platform for 900 tenant organisations. 500 subscribers in under two months.

His approach: starts with how people actually work, not aesthetics. Works well with expert users — scientists, clinicians, developers. Not a visual-first designer. Runs research, shapes briefs, navigates constraints.

Contact: uxmikko@gmail.com · linkedin.com/in/uxmikko · contact form at uxmikko.netlify.app/#contact

If asked something you don't know, say so honestly. Never make up case study details. Never discuss salary or rates.`;

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
