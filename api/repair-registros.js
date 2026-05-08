import { queryDb, NOTION_HEADERS, CATALOGO_DB, REGISTRO_DB } from './misiones.js';

/**
 * Repara registros de Bitácora que no tienen Personaje ni Stat Ref vinculados.
 * Make crea entradas sin esas relations, lo que rompe los rollups de XP.
 *
 * Estrategia:
 * 1. Lee Catálogo → mapa habitoId → stat string
 * 2. Lee Stats → mapa stat string → page_id
 * 3. Lee Registro Diario completo
 * 4. Para cada registro: si falta Personaje → agrega Paco. Si falta Stat Ref → resuelve vía Hábito Ref.
 * 5. PATCH solo si hay algo que cambiar.
 *
 * Modo dry-run: agregar ?dry=1 a la URL → reporta qué cambiaría sin tocar nada.
 */

const PERSONAJE_PAGE_ID = '357e89bc-3fee-81f7-a707-ccdde4a842ce';
const STATS_DB = '4abc659f8b144de99e8900fa1478964f';

async function patchPage(token, pageId, properties) {
  const r = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    method: 'PATCH',
    headers: NOTION_HEADERS(token),
    body: JSON.stringify({ properties }),
  });
  return { ok: r.ok, status: r.status, text: r.ok ? null : (await r.text()).slice(0, 300) };
}

/**
 * Lógica reutilizable. Reutilizada desde cron-daily.
 * @param {string} token - NOTION_TOKEN
 * @param {boolean} dryRun - si true, no hace PATCH (solo reporta)
 */
export async function runRepairRegistros(token, dryRun = false) {
  const [catalogo, stats, registros] = await Promise.all([
    queryDb(token, CATALOGO_DB),
    queryDb(token, STATS_DB),
    queryDb(token, REGISTRO_DB),
  ]);

  // Mapa habitoId → stat string (ej. '💪 Físico')
  const habitoToStat = {};
  for (const h of catalogo) {
    habitoToStat[h.id] = h.properties?.['Stat']?.select?.name || null;
  }

  // Mapa stat string → page_id
  const statToPageId = {};
  for (const s of stats) {
    const name = s.properties?.['Stat']?.title?.[0]?.plain_text || null;
    if (name) statToPageId[name] = s.id;
  }

  const updates = [];
  const skipped = [];
  const errors  = [];

  for (const reg of registros) {
    const props = reg.properties || {};
    const habitoRefId  = props['Hábito Ref']?.relation?.[0]?.id || null;
    const personajeIds = (props['Personaje']?.relation || []).map(r => r.id);
    const statRefIds   = (props['Stat Ref']?.relation || []).map(r => r.id);
    const entrada      = props['Entrada']?.title?.[0]?.plain_text || '(sin nombre)';

    const needsPersonaje = !personajeIds.includes(PERSONAJE_PAGE_ID);

    let targetStatPageId = null;
    let needsStatRef = false;
    if (habitoRefId) {
      const statName = habitoToStat[habitoRefId];
      if (statName && statToPageId[statName]) {
        targetStatPageId = statToPageId[statName];
        needsStatRef = !statRefIds.includes(targetStatPageId);
      }
    }

    if (!needsPersonaje && !needsStatRef) {
      skipped.push({ id: reg.id, entrada, reason: 'ya tiene relations correctas' });
      continue;
    }

    const patch = {};
    if (needsPersonaje) {
      const newRelations = [...new Set([...personajeIds, PERSONAJE_PAGE_ID])].map(id => ({ id }));
      patch['Personaje'] = { relation: newRelations };
    }
    if (needsStatRef && targetStatPageId) {
      const newStatRefs = [...new Set([...statRefIds, targetStatPageId])].map(id => ({ id }));
      patch['Stat Ref'] = { relation: newStatRefs };
    }

    const update = {
      id: reg.id,
      entrada,
      habitoRefId,
      added: {
        personaje: needsPersonaje,
        statRef: needsStatRef ? targetStatPageId : null,
      },
    };

    if (dryRun) {
      update.dryRun = true;
      updates.push(update);
      continue;
    }

    const result = await patchPage(token, reg.id, patch);
    if (result.ok) {
      updates.push(update);
    } else {
      errors.push({ ...update, error: result.text, status: result.status });
    }
  }

  return {
    dryRun,
    total: registros.length,
    updated: updates.length,
    skipped: skipped.length,
    errors: errors.length,
    updates,
    errorsDetails: errors,
    _debug: {
      catalogoCount: catalogo.length,
      statsCount: stats.length,
      registrosCount: registros.length,
      statToPageId,
    },
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST');

  const dryRun = req.query?.dry === '1' || req.query?.dryRun === 'true';

  try {
    const result = await runRepairRegistros(process.env.NOTION_TOKEN, dryRun);
    res.status(200).json(result);
  } catch (e) {
    res.status(500).json({ error: e.message, stack: e.stack });
  }
}
