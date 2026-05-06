const NOTION_HEADERS = (token) => ({
  'Authorization': `Bearer ${token}`,
  'Notion-Version': '2022-06-28',
  'Content-Type': 'application/json',
});

const REGISTRO_DB = '19a27bda-534c-4204-914e-86602ac2d28e';
const TZ = 'America/Mexico_City';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const NOTION_TOKEN = process.env.NOTION_TOKEN;

  // Hoy en zona horaria del usuario (formato YYYY-MM-DD)
  const today = new Date().toLocaleDateString('en-CA', { timeZone: TZ });

  try {
    const r = await fetch(`https://api.notion.com/v1/databases/${REGISTRO_DB}/query`, {
      method: 'POST',
      headers: NOTION_HEADERS(NOTION_TOKEN),
      body: JSON.stringify({
        filter: {
          property: 'Fecha',
          date: { equals: today },
        },
        page_size: 25,
      }),
    });

    if (!r.ok) {
      const errText = await r.text();
      return res.status(r.status).json({ error: errText });
    }

    const data = await r.json();

    // Mapear los campos relevantes para el widget
    const items = (data.results || []).map(p => ({
      id:      p.id,
      entrada: p.properties?.['Entrada']?.title?.[0]?.plain_text || '(sin nombre)',
      estado:  p.properties?.['Estado']?.select?.name || '⬜ Pendiente',
      xpBase:  p.properties?.['XP Base']?.rollup?.number ?? 0,
      xpGanado: p.properties?.['XP Ganado']?.formula?.number ?? 0,
    }));

    // Orden estable: pendientes primero, luego completados, luego omitidos.
    // Dentro de cada grupo: alfabético.
    const order = { '⬜ Pendiente': 0, '✅ Completado': 1, '❌ Omitido': 2 };
    items.sort((a, b) => {
      const oa = order[a.estado] ?? 99;
      const ob = order[b.estado] ?? 99;
      if (oa !== ob) return oa - ob;
      return a.entrada.localeCompare(b.entrada, 'es');
    });

    res.status(200).json({ today, count: items.length, items });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
