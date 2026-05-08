import { computeMisiones, NOTION_HEADERS } from './misiones.js';

/**
 * Calcula el progreso real de cada misión y lo escribe al campo "Progreso" en Notion.
 * Capeado a 100. Reutilizable desde cron-daily.
 */
export async function runSyncMisiones(token) {
  const { misiones } = await computeMisiones(token);

  const updates = [];
  const skipped = [];

  for (const m of misiones) {
    if (m.xpTargetRound <= 0) {
      skipped.push({ id: m.id, titulo: m.titulo, reason: 'sin habitos asociados' });
      continue;
    }

    const progresoCalc = m.progresoFinal ?? Math.min(100, m.progresoVsRound);
    const progresoActual = m.progresoManual;

    if (progresoCalc === progresoActual) {
      skipped.push({ id: m.id, titulo: m.titulo, reason: 'sin cambio', valor: progresoActual });
      continue;
    }

    const r = await fetch(`https://api.notion.com/v1/pages/${m.id}`, {
      method: 'PATCH',
      headers: NOTION_HEADERS(token),
      body: JSON.stringify({ properties: { Progreso: { number: progresoCalc } } }),
    });

    const ok = r.ok;
    const errBody = ok ? null : (await r.text()).slice(0, 300);

    updates.push({
      id: m.id, titulo: m.titulo,
      before: progresoActual, after: progresoCalc,
      xpAcumulado: m.xpAcumulado, xpTargetRound: m.xpTargetRound,
      ok, error: errBody,
    });
  }

  return {
    total: misiones.length,
    updated: updates.filter(u => u.ok).length,
    failed: updates.filter(u => !u.ok).length,
    skippedCount: skipped.length,
    updates, skipped,
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST');

  try {
    const result = await runSyncMisiones(process.env.NOTION_TOKEN);
    res.status(200).json(result);
  } catch (e) {
    res.status(500).json({ error: e.message, stack: e.stack });
  }
}
