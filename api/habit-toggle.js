const NOTION_HEADERS = (token) => ({
  'Authorization': `Bearer ${token}`,
  'Notion-Version': '2022-06-28',
  'Content-Type': 'application/json',
});

const ESTADOS_VALIDOS = ['⬜ Pendiente', '✅ Completado', '❌ Omitido'];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  // Body parsing tolerante: req.body puede venir parseado o como string
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch(e) { body = null; }
  }
  const { id, estado } = body || {};

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Falta o inválido el campo "id" (page_id de Notion).' });
  }
  if (!ESTADOS_VALIDOS.includes(estado)) {
    return res.status(400).json({
      error: `"estado" debe ser uno de: ${ESTADOS_VALIDOS.join(', ')}`,
      received: estado,
    });
  }

  const NOTION_TOKEN = process.env.NOTION_TOKEN;

  try {
    const r = await fetch(`https://api.notion.com/v1/pages/${id}`, {
      method: 'PATCH',
      headers: NOTION_HEADERS(NOTION_TOKEN),
      body: JSON.stringify({
        properties: {
          Estado: { select: { name: estado } },
        },
      }),
    });

    if (!r.ok) {
      const errText = await r.text();
      return res.status(r.status).json({ error: errText });
    }

    const updated = await r.json();
    res.status(200).json({
      ok: true,
      id: updated.id,
      estado: updated.properties?.['Estado']?.select?.name,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
