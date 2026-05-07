const NOTION_HEADERS = (token) => ({
  'Authorization': `Bearer ${token}`,
  'Notion-Version': '2022-06-28',
  'Content-Type': 'application/json',
});

// IDs son database_id (URL del navegador), NO data_source_id
const MISIONES_DB = '94334b895c7647b18e9102598bd4f5f8';
const CATALOGO_DB = '8e3fc249c044496ba815fde16c96d1f9';
const REGISTRO_DB = '4d07427278354af79dbb0b3091d42f77';

/**
 * Query con paginación. Devuelve hasta 500 items (5 páginas de 100).
 */
async function queryDb(token, db_id, body = {}) {
  let cursor = null;
  const all = [];
  for (let i = 0; i < 5; i++) {
    const reqBody = { page_size: 100, ...body };
    if (cursor) reqBody.start_cursor = cursor;

    const r = await fetch(`https://api.notion.com/v1/databases/${db_id}/query`, {
      method: 'POST',
      headers: NOTION_HEADERS(token),
      body: JSON.stringify(reqBody),
    });
    if (!r.ok) {
      const txt = await r.text();
      throw new Error(`Notion ${db_id}: ${r.status} ${txt.slice(0, 200)}`);
    }
    const data = await r.json();
    all.push(...(data.results || []));
    if (!data.has_more) break;
    cursor = data.next_cursor;
  }
  return all;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const NOTION_TOKEN = process.env.NOTION_TOKEN;

  try {
    // 3 queries en paralelo: misiones, catálogo, registros completados
    const [misionesRaw, catalogoRaw, registrosRaw] = await Promise.all([
      queryDb(NOTION_TOKEN, MISIONES_DB),
      queryDb(NOTION_TOKEN, CATALOGO_DB),
      queryDb(NOTION_TOKEN, REGISTRO_DB, {
        filter: { property: 'Estado', select: { equals: '✅ Completado' } },
      }),
    ]);

    // Mapa hábitos: id → { nombre, xpValor, registrosIds }
    const habitosMap = {};
    for (const h of catalogoRaw) {
      habitosMap[h.id] = {
        id: h.id,
        nombre: h.properties?.['Hábito']?.title?.[0]?.plain_text || '(sin nombre)',
        xpValor: h.properties?.['XP Valor']?.number || 0,
        registrosIds: (h.properties?.['Registros']?.relation || []).map(r => r.id),
      };
    }

    // Mapa registros completados: id → { xpGanado, habitoId }
    const registrosMap = {};
    for (const r of registrosRaw) {
      registrosMap[r.id] = {
        id: r.id,
        xpGanado: r.properties?.['XP Ganado']?.formula?.number || 0,
        habitoId: r.properties?.['Hábito Ref']?.relation?.[0]?.id || null,
      };
    }

    // Construir misiones con datos cruzados
    const misiones = misionesRaw.map(m => {
      const habitosIds = (m.properties?.['Hábitos asociados']?.relation || []).map(r => r.id);
      const habitos = habitosIds.map(hid => habitosMap[hid]).filter(Boolean);

      let xpAcumulado = 0;
      let completadosTotal = 0;

      const habitosDetalle = habitos.map(h => {
        // Registros completados de este hábito
        const completados = h.registrosIds
          .map(rid => registrosMap[rid])
          .filter(Boolean);
        const xp = completados.reduce((s, r) => s + (r.xpGanado || 0), 0);
        xpAcumulado += xp;
        completadosTotal += completados.length;
        return {
          id: h.id,
          nombre: h.nombre,
          xpValor: h.xpValor,
          vecesCompletado: completados.length,
          xpAcumulado: xp,
        };
      });

      const xpTargetRound = habitos.reduce((s, h) => s + h.xpValor, 0); // 1 vuelta
      const progresoVsRound = xpTargetRound > 0
        ? Math.round((xpAcumulado / xpTargetRound) * 100)
        : 0;

      return {
        id: m.id,
        titulo: m.properties?.['Misión']?.title?.[0]?.plain_text || '(sin título)',
        tipo: m.properties?.['Tipo']?.select?.name || null,
        estado: m.properties?.['Estado']?.select?.name || null,
        categoria: m.properties?.['Categoría']?.select?.name || null,
        dificultad: m.properties?.['Dificultad']?.select?.name || null,
        xpRecompensa: m.properties?.['XP Recompensa']?.number || 0,
        progresoManual: m.properties?.['Progreso']?.number || 0,
        // Datos calculados
        xpAcumulado,
        xpTargetRound,        // suma de XP Valor de hábitos asociados (1 vuelta)
        progresoVsRound,      // % vs xpTargetRound (útil si target = 1 vuelta)
        habitosCount: habitos.length,
        completadosTotal,
        habitos: habitosDetalle,
      };
    });

    // Orden: activas primero, luego en progreso, completadas, bloqueadas, abandonadas
    const orderEstado = {
      '🔥 Activa': 0,
      '⚔️ En progreso': 1,
      '✅ Completada': 2,
      '🔒 Bloqueada': 3,
      '💀 Abandonada': 4,
    };
    misiones.sort((a, b) => {
      const oa = orderEstado[a.estado] ?? 99;
      const ob = orderEstado[b.estado] ?? 99;
      if (oa !== ob) return oa - ob;
      return (b.xpAcumulado || 0) - (a.xpAcumulado || 0);
    });

    res.status(200).json({
      count: misiones.length,
      misiones,
      _debug: {
        misionesCount: misionesRaw.length,
        catalogoCount: catalogoRaw.length,
        registrosCompletadosCount: registrosRaw.length,
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message, stack: e.stack });
  }
}
