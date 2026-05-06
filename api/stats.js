// Helper compartido para llamadas a Notion
const NOTION_HEADERS = (token) => ({
  'Authorization': `Bearer ${token}`,
  'Notion-Version': '2022-06-28',
  'Content-Type': 'application/json',
});

/**
 * Resuelve un rollup truncado vía /v1/pages/{page_id}/properties/{property_id}.
 * Cuando databases.query devuelve null en un rollup grande, este endpoint
 * pagina los items y permite sumar manualmente.
 * Retorna un número (suma) o null si no se pudo resolver.
 */
async function resolveTruncatedRollup(token, pageId, propertyId) {
  let cursor = null;
  let total = 0;
  let resolved = false;

  do {
    const url = `https://api.notion.com/v1/pages/${pageId}/properties/${propertyId}`
              + (cursor ? `?start_cursor=${cursor}&page_size=100` : `?page_size=100`);
    const r = await fetch(url, { headers: NOTION_HEADERS(token) });
    if (!r.ok) return null;
    const data = await r.json();

    // Caso 1: el endpoint resuelve directamente como rollup.number → usalo
    if (data.object === 'property_item' && data.type === 'rollup' && data.rollup?.type === 'number') {
      return data.rollup.number ?? 0;
    }

    // Caso 2: el endpoint devuelve una lista paginada con items
    if (data.object === 'list' && Array.isArray(data.results)) {
      for (const item of data.results) {
        if (item.type === 'number')                                           total += item.number ?? 0;
        else if (item.type === 'formula' && item.formula?.type === 'number')  total += item.formula.number ?? 0;
        else if (item.type === 'rollup'  && item.rollup?.type  === 'number')  total += item.rollup.number ?? 0;
      }
      cursor = data.has_more ? data.next_cursor : null;
      resolved = true;
    } else {
      break;
    }
  } while (cursor);

  return resolved ? total : null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const NOTION_TOKEN = process.env.NOTION_TOKEN;
  const PERSONAJE_DB = '9be62f8e75094d0e8e9be41e96eeb8ca';
  const STATS_DB     = '4abc659f8b144de99e8900fa1478964f';

  try {
    const [personajeRes, statsRes] = await Promise.all([
      fetch(`https://api.notion.com/v1/databases/${PERSONAJE_DB}/query`, {
        method: 'POST',
        headers: NOTION_HEADERS(NOTION_TOKEN),
        body: JSON.stringify({ page_size: 1 }),
      }),
      fetch(`https://api.notion.com/v1/databases/${STATS_DB}/query`, {
        method: 'POST',
        headers: NOTION_HEADERS(NOTION_TOKEN),
        body: JSON.stringify({ page_size: 10 }),
      }),
    ]);

    const personajeData = await personajeRes.json();
    const statsData     = await statsRes.json();

    const page  = personajeData.results[0];
    const props = page.properties;

    // Lectura tolerante a tipo: number | formula.number | rollup.number
    const readNumeric = (prop) => {
      const p = props[prop];
      if (!p) return null;
      if (p.type === 'number')  return (p.number  ?? null);
      if (p.type === 'formula') return (p.formula?.number ?? null);
      if (p.type === 'rollup')  return (p.rollup?.number  ?? null);
      return null;
    };

    // --- COMPONENTES de XP ---
    // Para cada componente: leer valor; si rollup viene null, intentar resolver vía /pages/{id}/properties/{propId}
    const componentNames = [
      'XP Físico', 'XP Mente', 'XP Hábitos', 'XP Nutrición', 'XP Negocio',
      'XP Hábitos Auto', 'XP Auto',
    ];

    const xpComponents = {};
    const xpResolutionLog = {};

    for (const name of componentNames) {
      let val = readNumeric(name);
      let source = 'direct';

      // Si es un rollup que vino null, intentar el endpoint de pages.properties
      if (val == null && props[name]?.type === 'rollup' && props[name]?.id) {
        const resolved = await resolveTruncatedRollup(NOTION_TOKEN, page.id, props[name].id);
        if (resolved != null) {
          val = resolved;
          source = 'pages.properties (paginated)';
        }
      }

      xpComponents[name] = val ?? 0;
      xpResolutionLog[name] = { value: val, source: val == null ? 'unresolved' : source };
    }

    // --- XP TOTAL ---
    // Calcular SIEMPRE manualmente sumando componentes resueltos.
    // (La fórmula "XP Total" de Notion depende del rollup roto y devuelve un valor incompleto.)
    const xpTotal = componentNames.reduce((sum, n) => sum + (xpComponents[n] || 0), 0);
    const xpTotalNotion = readNumeric('XP Total'); // sólo para diagnóstico

    const nivel  = Math.floor(xpTotal / 500) + 1;
    const rangos = ['💀 Iniciado','🗡️ Aprendiz','📖 Practicante','🛡️ Especialista','💎 Experto','🔥 Maestro','⚔️ Gran Maestro','👑 Leyenda'];
    const rango  = rangos[Math.min(nivel - 1, rangos.length - 1)];

    const cur     = xpTotal - (Math.floor(xpTotal / 500) * 500);
    const filled  = Math.floor(cur / 50);
    const barraXP = `Nv.${nivel} ${'▰'.repeat(filled)}${'▱'.repeat(10 - filled)} ${cur}/500 XP`;

    // --- STATS por categoría ---
    const statMap = {};
    for (const row of statsData.results) {
      const name = row.properties['Stat']?.title?.[0]?.plain_text || '';
      const xp   = row.properties['XP Total Stat']?.rollup?.number || 0;
      if (name.includes('Físico'))    statMap.fisico    = xp;
      if (name.includes('Mente'))     statMap.mente     = xp;
      if (name.includes('Nutrición')) statMap.nutricion = xp;
      if (name.includes('Hábitos'))   statMap.habitos   = xp;
      if (name.includes('Negocio'))   statMap.negocio   = xp;
    }

    res.status(200).json({
      fisico:    statMap.fisico    || 0,
      mente:     statMap.mente     || 0,
      nutricion: statMap.nutricion || 0,
      habitos:   statMap.habitos   || 0,
      negocio:   statMap.negocio   || 0,
      xpTotal,
      nivel,
      rango,
      barraXP,
      _debug: {
        xpSource: 'manual sum (with rollup resolution)',
        xpTotalNotion,
        xpComponents,
        xpResolutionLog,
      },
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
