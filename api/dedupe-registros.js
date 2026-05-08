import { queryDb, NOTION_HEADERS, REGISTRO_DB } from './misiones.js';

/**
 * Elimina registros duplicados de Bitácora para una fecha dada.
 * Por cada Hábito Ref único, mantiene SOLO la entrada más reciente
 * (por createdTime) y manda las demás a papelera (archived=true).
 *
 * Uso:
 *   GET /api/dedupe-registros?date=2026-05-08
 *   GET /api/dedupe-registros?date=2026-05-08&dry=1   (dry-run, no elimina)
 *
 * Si no se pasa date, usa hoy en TZ México.
 */

const TZ = 'America/Mexico_City';

function todayInTZ() {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const parts = fmt.formatToParts(new Date());
  const y = parts.find(p => p.type === 'year').value;
  const m = parts.find(p => p.type === 'month').value;
  const d = parts.find(p => p.type === 'day').value;
  return `${y}-${m}-${d}`;
}

async function archivePage(token, pageId) {
  const r = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    method: 'PATCH',
    headers: NOTION_HEADERS(token),
    body: JSON.stringify({ archived: true }),
  });
  return { ok: r.ok, status: r.status, text: r.ok ? null : (await r.text()).slice(0, 300) };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST');

  const NOTION_TOKEN = process.env.NOTION_TOKEN;
  const dryRun = req.query?.dry === '1' || req.query?.dryRun === 'true';
  const targetDate = (req.query?.date || '').match(/^\d{4}-\d{2}-\d{2}$/) ? req.query.date : todayInTZ();

  try {
    // Query registros del día
    const registros = await queryDb(NOTION_TOKEN, REGISTRO_DB, {
      filter: { property: 'Fecha', date: { equals: targetDate } },
      page_size: 100,
    });

    // Agrupar por Hábito Ref
    const grupos = {};
    for (const reg of registros) {
      const habitoId = reg.properties?.['Hábito Ref']?.relation?.[0]?.id || '_sin_habito';
      if (!grupos[habitoId]) grupos[habitoId] = [];
      grupos[habitoId].push({
        id: reg.id,
        createdTime: reg.created_time,
        entrada: reg.properties?.['Entrada']?.title?.[0]?.plain_text || '(sin nombre)',
        estado: reg.properties?.['Estado']?.select?.name || '⬜ Pendiente',
        // Sumar relations seteadas (para preferir el que tenga más datos completos en empate)
        completeness: (
          (reg.properties?.['Personaje']?.relation?.length ? 1 : 0) +
          (reg.properties?.['Stat Ref']?.relation?.length ? 1 : 0)
        ),
      });
    }

    // Para cada grupo: elegir el "ganador" (más reciente + más completo) y archivar el resto
    const kept = [];
    const archived = [];
    const errors = [];

    for (const [habitoId, items] of Object.entries(grupos)) {
      if (items.length === 1) {
        kept.push({ ...items[0], habitoId, reason: 'único' });
        continue;
      }

      // Orden: completeness DESC, createdTime DESC. Ganador queda primero.
      items.sort((a, b) => {
        if (b.completeness !== a.completeness) return b.completeness - a.completeness;
        return new Date(b.createdTime) - new Date(a.createdTime);
      });

      const winner = items[0];
      kept.push({ ...winner, habitoId, reason: 'ganador (más reciente + completo)', duplicates: items.length - 1 });

      // Archivar el resto
      for (const loser of items.slice(1)) {
        if (dryRun) {
          archived.push({ ...loser, habitoId, action: 'would archive (dry-run)' });
          continue;
        }
        const result = await archivePage(NOTION_TOKEN, loser.id);
        if (result.ok) {
          archived.push({ ...loser, habitoId, action: 'archived' });
        } else {
          errors.push({ ...loser, habitoId, error: result.text, status: result.status });
        }
      }
    }

    res.status(200).json({
      dryRun,
      date: targetDate,
      total: registros.length,
      gruposCount: Object.keys(grupos).length,
      kept: kept.length,
      archived: archived.length,
      errors: errors.length,
      keptDetails: kept,
      archivedDetails: archived,
      errorsDetails: errors,
    });
  } catch (e) {
    res.status(500).json({ error: e.message, stack: e.stack });
  }
}
