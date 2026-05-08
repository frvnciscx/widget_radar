import { computeMisiones, NOTION_HEADERS } from './misiones.js';

const PERSONAJE_PAGE_ID = '357e89bc-3fee-81f7-a707-ccdde4a842ce';
const HUMANIDAD_MAX = 5;

/**
 * Calcula el progreso real de cada misión y lo escribe al campo "Progreso" en Notion.
 * Adicionalmente: si una misión Épica llegó a 100% y aún no recibió el bonus de Humanidad,
 * suma +1 a Humanidad del personaje (capped a 5), marca la misión como Completada y
 * setea Humanidad Otorgada = true para anti-doble-conteo.
 */
export async function runSyncMisiones(token) {
  const { misiones } = await computeMisiones(token);

  const updates = [];
  const skipped = [];

  // ---------- 1. Sincronizar campo Progreso de cada misión ----------
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

  // ---------- 2. Bonus de Humanidad por Épica completada ----------
  // Detectar misiones donde:
  //   - Dificultad = 💀 Épica
  //   - progresoFinal >= 100
  //   - Humanidad Otorgada = false (anti-doble-conteo)
  const epicasParaBonus = misiones.filter(m =>
    m.dificultad === '💀 Épica' &&
    (m.progresoFinal ?? m.progresoVsRound) >= 100 &&
    !m.humanidadOtorgada
  );

  const bonusHumanidad = [];

  if (epicasParaBonus.length > 0) {
    // Fetch Personaje (Paco) una vez
    const persResp = await fetch(`https://api.notion.com/v1/pages/${PERSONAJE_PAGE_ID}`, {
      headers: NOTION_HEADERS(token),
    });
    const persData = await persResp.json();
    let humActual = persData?.properties?.['Humanidad']?.number ?? 0;

    for (const m of epicasParaBonus) {
      const humAntes = humActual;
      const humDespues = Math.min(HUMANIDAD_MAX, humAntes + 1);

      // Marcar misión como Completada + flag Humanidad Otorgada
      const patchMision = await fetch(`https://api.notion.com/v1/pages/${m.id}`, {
        method: 'PATCH',
        headers: NOTION_HEADERS(token),
        body: JSON.stringify({
          properties: {
            'Humanidad Otorgada': { checkbox: true },
            'Estado': { select: { name: '✅ Completada' } },
          },
        }),
      });

      // Si humanidad puede subir (no estaba en cap), actualizar Personaje
      let humanidadPatchOk = true;
      if (humDespues !== humAntes) {
        const patchPers = await fetch(`https://api.notion.com/v1/pages/${PERSONAJE_PAGE_ID}`, {
          method: 'PATCH',
          headers: NOTION_HEADERS(token),
          body: JSON.stringify({
            properties: { 'Humanidad': { number: humDespues } },
          }),
        });
        humanidadPatchOk = patchPers.ok;
        if (humanidadPatchOk) humActual = humDespues;
      }

      bonusHumanidad.push({
        id: m.id,
        titulo: m.titulo,
        humanidadBefore: humAntes,
        humanidadAfter: humDespues,
        capped: humAntes === HUMANIDAD_MAX,
        misionPatchOk: patchMision.ok,
        humanidadPatchOk,
      });
    }
  }

  return {
    total: misiones.length,
    updated: updates.filter(u => u.ok).length,
    failed: updates.filter(u => !u.ok).length,
    skippedCount: skipped.length,
    bonusHumanidadCount: bonusHumanidad.length,
    updates,
    skipped,
    bonusHumanidad,
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
