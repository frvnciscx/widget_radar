import { runRepairRegistros } from './repair-registros.js';
import { runSyncMisiones }   from './sync-misiones.js';

/**
 * Endpoint diario. Ejecuta en orden:
 * 1. repair-registros: vincula Personaje + Stat Ref a registros nuevos creados por Make
 * 2. sync-misiones: recalcula y escribe Progreso de cada misión a Notion
 *
 * Configurado en vercel.json como cron diario (5:00 UTC ≈ 23:00–00:00 México).
 * Vercel Hobby permite hasta 2 cron jobs; este endpoint combina ambas tareas en 1.
 *
 * También se puede llamar manualmente para forzar sync.
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST');

  const token = process.env.NOTION_TOKEN;
  const startedAt = new Date().toISOString();

  const result = {
    startedAt,
    repair:  null,
    sync:    null,
    duration_ms: null,
  };

  try {
    // PASO 1: Repair (debe correr ANTES de sync — sync depende de relations correctas)
    const t0 = Date.now();
    result.repair = await runRepairRegistros(token, false);
    const t1 = Date.now();
    result.repair.duration_ms = t1 - t0;

    // PASO 2: Sync misiones (usa los datos ya reparados)
    result.sync = await runSyncMisiones(token);
    const t2 = Date.now();
    result.sync.duration_ms = t2 - t1;

    result.duration_ms = t2 - t0;
    res.status(200).json(result);
  } catch (e) {
    result.error = e.message;
    result.stack = e.stack;
    res.status(500).json(result);
  }
}
