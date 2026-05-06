export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const NOTION_TOKEN = process.env.NOTION_TOKEN;
  const PERSONAJE_DB = '9be62f8e75094d0e8e9be41e96eeb8ca';
  try {
    const r = await fetch(`https://api.notion.com/v1/databases/${PERSONAJE_DB}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NOTION_TOKEN}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ page_size: 1 }),
    });
    const data = await r.json();
    const props = data.results[0].properties;
    const simplified = {};
    for (const [key, val] of Object.entries(props)) {
      simplified[key] = { type: val.type, value: val[val.type] };
    }
    res.status(200).json(simplified);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
