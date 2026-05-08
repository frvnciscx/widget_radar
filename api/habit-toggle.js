const NOTION_HEADERS = (token) => ({
  'Authorization': `Bearer ${token}`,
  'Notion-Version': '2022-06-28',
  'Content-Type': 'application/json',
});

const ESTADOS_VALIDOS = ['⬜ Pendiente', '✅ Completado', '❌ Omitido'];

// Page ID del personaje principal (Paco)
const PERSONAJE_PAGE_ID = '357e89bc-3fee-81f7-a707-ccdde4a842ce';
const HUMANIDAD_MAX = 5;
const HUMANIDAD_MIN = 0;

async function fetchPage(token, pageId) {
  const r = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    headers: NOTION_HEADERS(token),
  });
  if (!r.ok) return null;
  return r.json();
}

async function patchPage(token, pageId, properties) {
  return fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    method: 'PATCH',
    headers: NOTION_HEADERS(token),
    body: JSON.stringify({ properties }),
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch(e) { body = null; }
  }
  const { id, estado, useHoguera } = body || {};

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Falta o inválido el campo "id".' });
  }
  if (!ESTADOS_VALIDOS.includes(estado)) {
    return res.status(400).json({
      error: `"estado" debe ser uno de: ${ESTADOS_VALIDOS.join(', ')}`,
      received: estado,
    });
  }

  const NOTION_TOKEN = process.env.NOTION_TOKEN;

  try {
    // 1. Leer registro actual para conocer estado anterior y hábito asociado
    const currentPage = await fetchPage(NOTION_TOKEN, id);
    if (!currentPage) {
      return res.status(404).json({ error: 'Registro no encontrado' });
    }

    const oldEstado    = currentPage.properties?.['Estado']?.select?.name || null;
    const habitoRefId  = currentPage.properties?.['Hábito Ref']?.relation?.[0]?.id || null;

    // 2. En paralelo: PATCH al registro + obtener tipo del hábito (si hay)
    const [patchResult, habitoPage] = await Promise.all([
      patchPage(NOTION_TOKEN, id, {
        Estado: { select: { name: estado } },
      }),
      habitoRefId ? fetchPage(NOTION_TOKEN, habitoRefId) : Promise.resolve(null),
    ]);

    if (!patchResult.ok) {
      const errText = await patchResult.text();
      return res.status(patchResult.status).json({ error: errText });
    }

    // 3. Determinar si es Prohibido y calcular delta de humanidad
    const tipo = habitoPage?.properties?.['Tipo']?.select?.name || null;
    const isProhibido = tipo === '🔴 Prohibido';

    const wasOmitido    = oldEstado === '❌ Omitido';
    const willBeOmitido = estado === '❌ Omitido';

    let humanidadDelta = 0;
    let humanidadReason = 'sin cambio';

    if (isProhibido) {
      if (!wasOmitido && willBeOmitido) {
        humanidadDelta = -1;
        humanidadReason = 'caíste en prohibido';
      } else if (wasOmitido && !willBeOmitido) {
        humanidadDelta = +1;
        humanidadReason = 'revertiste caída';
      }
    }

    // 4. Si hay delta, actualizar Humanidad — pero antes chequear si hay hoguera disponible
    let humanidadInfo = { delta: 0, before: null, after: null, reason: humanidadReason };
    let hogueraInfo   = { used: false, before: null, after: null };

    if (humanidadDelta !== 0) {
      const personajePage = await fetchPage(NOTION_TOKEN, PERSONAJE_PAGE_ID);
      const humBefore = personajePage?.properties?.['Humanidad']?.number ?? 0;
      const hogBefore = personajePage?.properties?.['Hogueras']?.number ?? 0;

      // Caso 1: el usuario quiere usar hoguera al caer (-1 humanidad → -1 hoguera)
      if (useHoguera === true && humanidadDelta === -1 && hogBefore > 0) {
        const hogAfter = hogBefore - 1;
        await patchPage(NOTION_TOKEN, PERSONAJE_PAGE_ID, {
          Hogueras: { number: hogAfter },
        });
        hogueraInfo = { used: true, before: hogBefore, after: hogAfter };
        humanidadInfo = {
          delta: 0, before: humBefore, after: humBefore,
          reason: 'caída absorbida por hoguera (humanidad intacta)',
        };
      } else {
        // Caso 2: aplicar el delta a humanidad normalmente (con cap)
        const humAfter = Math.max(HUMANIDAD_MIN, Math.min(HUMANIDAD_MAX, humBefore + humanidadDelta));
        if (humAfter !== humBefore) {
          await patchPage(NOTION_TOKEN, PERSONAJE_PAGE_ID, {
            Humanidad: { number: humAfter },
          });
        }
        humanidadInfo = { delta: humanidadDelta, before: humBefore, after: humAfter, reason: humanidadReason };
        // Si pidió hoguera pero no había, registrarlo
        if (useHoguera === true && hogBefore === 0) {
          hogueraInfo = { used: false, before: 0, after: 0, reason: 'sin hogueras disponibles, costó humanidad' };
        }
      }
    }

    res.status(200).json({
      ok: true,
      id,
      estado,
      oldEstado,
      isProhibido,
      humanidad: humanidadInfo,
      hoguera: hogueraInfo,
    });
  } catch (e) {
    res.status(500).json({ error: e.message, stack: e.stack });
  }
}
