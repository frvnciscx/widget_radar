import { runRepairRegistros } from './repair-registros.js';
import { runSyncMisiones }   from './sync-misiones.js';

const PERSONAJE_PAGE_ID = '357e89bc-3fee-81f7-a707-ccdde4a842ce';
const HOGUERAS_RESET = 4;

/**
 * Si hoy es lunes en zona horaria México, resetea Hogueras del Personaje a 4.
 * Las Hogueras representan excepciones autorizadas (max 4 por semana).
 */
async function resetHoguerasIfMonday(token) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Mexico_City',
    weekday: 'short',
  });
  const dayOfWeek = fmt.format(new Date()); // 'Mon', 'Tue', etc.
  if (dayOfWeek !== 'Mon') return { skipped: true, day: dayOfWeek };

  const r = await fetch(`https://api.notion.com/v1/pages/${PERSONAJE_PAGE_ID}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: { Hogueras: { number: HOGUERAS_RESET } },
    }),
  });
  return { skipped: false, day: dayOfWeek, ok: r.ok, value: HOGUERAS_RESET };
}

/**
 * Endpoint diario. Ejecuta en orden:
 * 1. repair-registros: vincula Personaje + Stat Ref a registros nuevos creados por Make
 * 2. sync-misiones: recalcula y escribe Progreso (+ bonus Humanidad si Épica completada)
 * 3. resetHoguerasIfMonday: si es lunes, resetea Hogueras a 4
 *
 * Configurado en vercel.json como cron diario (5:00 UTC ≈ 23:00–00:00 México).
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST');

  const token = process.env.NOTION_TOKEN;
  const startedAt = new Date().toISOString();

  const result = {
    startedAt,
    repair:    null,
    sync:      null,
    hogueras:  null,
    duration_ms: null,
  };

  try {
    // PASO 1: Repair (debe correr ANTES de sync — sync depende de relations correctas)
    const t0 = Date.now();
    result.repair = await runRepairRegistros(token, false);
    const t1 = Date.now();
    result.repair.duration_ms = t1 - t0;

    // PASO 2: Sync misiones (usa los datos ya reparados, incluye bonus Humanidad si Épica)
    result.sync = await runSyncMisiones(token);
    const t2 = Date.now();
    result.sync.duration_ms = t2 - t1;

    // PASO 3: Reset Hogueras si es lunes
    result.hogueras = await resetHoguerasIfMonday(token);
    const t3 = Date.now();
    result.hogueras.duration_ms = t3 - t2;

    result.duration_ms = t3 - t0;
    res.status(200).json(result);
  } catch (e) {
    result.error = e.message;
    result.stack = e.stack;
    res.status(500).json(result);
  }
}
