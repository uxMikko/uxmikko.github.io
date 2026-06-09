const NOTION_TOKEN      = process.env.NOTION_TOKEN;
const NOTION_SURVEY_DB  = process.env.NOTION_SURVEY_DB_ID;

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': 'https://uxmikko.netlify.app',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  if (!NOTION_TOKEN || !NOTION_SURVEY_DB) {
    console.error('Survey: missing NOTION_TOKEN or NOTION_SURVEY_DB_ID');
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Not configured' }) };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { caseStudy = 'unknown', capacity, relevance, missing = '' } = body;
  if (!capacity || !relevance) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'capacity and relevance required' }) };
  }

  try {
    const res = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${NOTION_TOKEN}`,
        'Notion-Version': '2022-06-28',
      },
      body: JSON.stringify({
        parent: { database_id: NOTION_SURVEY_DB },
        properties: {
          'Case study': { title:     [{ text: { content: caseStudy } }] },
          'Capacity':   { select:    { name: capacity } },
          'Relevance':  { select:    { name: relevance } },
          'Missing':    { rich_text: [{ text: { content: missing.slice(0, 2000) } }] },
        },
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error('Notion survey error:', res.status, err);
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Failed to save' }) };
    }
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  } catch (e) {
    console.error('Survey handler error:', e);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server error' }) };
  }
};
