const NOTION_HEADERS = (token) => ({
  'Authorization': `Bearer ${token}`,
  'Notion-Version': '2022-06-28',
  'Content-Type': 'application/json',
});

const REGISTRO_DB = '4d07427278354af79dbb0b3091d42f77';
const CATALOGO_DB = '8e3fc249c044496ba815fde16c96d1f9';
const TZ = 'America/Mexico_City';

/**
 * Calcula "hoy" en zona horaria México como string YYYY-MM-DD.
 */
function todayInTZ(timeZone = TZ) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const parts = fmt.formatToParts(new Date());
  const y = parts.find(p => p.type === 'year').value;
  const m = parts.find(p => p.type === 'month').value;
  const d = parts.find(p => p.type === 'day').value;
  return `${y}-${m}-${d}`;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const NOTION_TOKEN = process.env.NOTION_TOKEN;

  const overrideDate = (req.query?.date || '').match(/^\d{4}-\d{2}-\d{2}$/) ? req.query.date : null;
  const today = overrideDate || todayInTZ();
  const serverNow = new Date().toISOString();

  try {
    // 2 queries en paralelo: registros del día + catálogo (para nombres y estado Activo)
    const [regRes, catRes] = await Promise.all([
      fetch(`https://api.notion.com/v1/databases/${REGISTRO_DB}/query`, {
        method: 'POST',
        headers: NOTION_HEADERS(NOTION_TOKEN),
        body: JSON.stringify({
          filter: { property: 'Fecha', date: { equals: today } },
          page_size: 25,
        }),
      }),
      fetch(`https://api.notion.com/v1/databases/${CATALOGO_DB}/query`, {
        method: 'POST',
        headers: NOTION_HEADERS(NOTION_TOKEN),
        body: JSON.stringify({ page_size: 100 }),
      }),
    ]);

    if (!regRes.ok) {
      const errText = await regRes.text();
      return res.status(regRes.status).json({ error: errText, _debug: { today, serverNow } });
    }

    const regData = await regRes.json();
    const catData = catRes.ok ? await catRes.json() : { results: [] };

    // Mapa de hábitos: page_id → { nombre actual, activo }
    const habitosMap = {};
    for (const h of (catData.results || [])) {
      habitosMap[h.id] = {
        nombre: h.properties?.['Hábito']?.title?.[0]?.plain_text || null,
        activo: h.properties?.['Activo']?.select?.name || '✅ Activo',
        xpValor: h.properties?.['XP Valor']?.number ?? 0,
      };
    }

    // Construir items con nombre actual del Catálogo + filtrar pausados
    const itemsRaw = (regData.results || []).map(p => {
      const habitoRefId = p.properties?.['Hábito Ref']?.relation?.[0]?.id || null;
      const habitoCat   = habitoRefId ? habitosMap[habitoRefId] : null;
      const entradaHist = p.properties?.['Entrada']?.title?.[0]?.plain_text || '(sin nombre)';
      // Nombre preferido: del Catálogo (siempre actualizado). Fallback: Entrada histórica.
      const entrada = habitoCat?.nombre || entradaHist;
      const xpFromCat = habitoCat?.xpValor ?? null;

      return {
        id:       p.id,
        habitoId: habitoRefId,
        entrada,
        estado:   p.properties?.['Estado']?.select?.name || '⬜ Pendiente',
        // XP Base es rollup; si no se resuelve usamos XP Valor del Catálogo como fallback
        xpBase:   p.properties?.['XP Base']?.rollup?.number ?? xpFromCat ?? 0,
        xpGanado: p.properties?.['XP Ganado']?.formula?.number ?? 0,
        fecha:    p.properties?.['Fecha']?.date?.start || null,
        habitoActivo: habitoCat?.activo || '✅ Activo',
      };
    });

    // Filtrar: excluir registros cuyo hábito está Pausado en el Catálogo
    // (registros sin Hábito Ref se mantienen por compatibilidad histórica)
    const items = itemsRaw.filter(it => it.habitoActivo !== '⏸️ Pausado');
    const excluidosPausados = itemsRaw.length - items.length;

    // Orden: pendientes primero, luego completados, luego omitidos. Alfabético dentro.
    const order = { '⬜ Pendiente': 0, '✅ Completado': 1, '❌ Omitido': 2 };
    items.sort((a, b) => {
      const oa = order[a.estado] ?? 99;
      const ob = order[b.estado] ?? 99;
      if (oa !== ob) return oa - ob;
      return a.entrada.localeCompare(b.entrada, 'es');
    });

    res.status(200).json({
      today,
      count: items.length,
      items,
      _debug: {
        serverNow,
        timezone: TZ,
        registrosTotal: itemsRaw.length,
        excluidosPausados,
        catalogoLoaded: catRes.ok,
      },
    });
  } catch (e) {
    res.status(500).json({
      error: e.message,
      stack: e.stack,
      _debug: { today, serverNow },
    });
  }
}
