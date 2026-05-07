# Contexto — Widget Development para Notion (Cowork)

## Objetivo
Desarrollar widgets embebibles en Notion que se conectan a bases de datos de Notion via API.
Los widgets viven en un repositorio de GitHub y se despliegan en Vercel.

## Stack
- **Frontend**: HTML + CSS + JS vanilla (sin frameworks)
- **Backend**: Vercel Serverless Functions (Node.js)
- **Base de datos**: Notion API
- **Deploy**: Vercel (auto-deploy desde GitHub en cada push)
- **Repo GitHub**: `frvnciscx/widget_radar`
- **URL producción**: `https://widgetradar.vercel.app`

## Carpeta local
`C:\Users\the_e\OneDrive\Documentos\varios\radar widget`

## Estructura del proyecto
```
radar-widget/
├── api/
│   ├── stats.js          ← Lee Personaje + Stats (con Humanidad y bypass de rollups)
│   ├── registro.js       ← GET hábitos del día (resuelve nombres del Catálogo, filtra pausados)
│   ├── habit-toggle.js   ← POST cambiar estado (auto -1 Humanidad si Prohibido cae)
│   ├── misiones.js       ← GET misiones con progreso calculado (Veces Target o fallback)
│   ├── sync-misiones.js  ← POST escribe Progreso de cada misión a Notion (manual + cron diario)
│   └── debug.js          ← Dump raw JSON del Personaje
├── index.html            ← Radar de stats (widget activo)
├── personaje.html        ← HUD nivel/XP/rango/Humanidad (widget activo)
├── registro.html         ← Check-in diario interactivo (widget activo)
├── vercel.json           ← Rutas + cron diario
└── package.json
```

## Widgets activos
| Widget | URL | Descripción |
|--------|-----|-------------|
| Radar de stats | `widgetradar.vercel.app` | Radar chart con 5 stats + barras |
| HUD Personaje | `widgetradar.vercel.app/personaje` | Nivel, XP, Rango + **Humanidad (5 pips)** + Estado (Humano/Maldito/Hueco) |
| Check-in diario | `widgetradar.vercel.app/registro` | Hábitos del día con botones ⬜/✅/❌ + auto-humanidad |

## Widgets pendientes por construir
| Widget | Descripción |
|--------|-------------|
| Misiones activas | Lista de misiones con barras de progreso (consumiría /api/misiones) |
| Racha diaria | Días consecutivos sin caer en Prohibidos |

## Endpoints API
| Endpoint | Método | Función |
|----------|--------|---------|
| `/api/stats` | GET | Personaje + Stats + Humanidad + Estado |
| `/api/registro` | GET | Hábitos de hoy (filtra pausados, resuelve nombres) |
| `/api/habit-toggle` | POST | Cambia estado + auto-decremento Humanidad si cae en Prohibido |
| `/api/misiones` | GET | Misiones con progreso real (cruza 3 DBs) |
| `/api/sync-misiones` | GET/POST | Escribe Progreso a Notion (también ejecuta cron diario) |
| `/api/debug` | GET | Dump raw del Personaje |

## Cron Jobs (vercel.json)
- `/api/sync-misiones` — diario a las 5:00 UTC (~23:00–00:00 México). Sincroniza Progreso de cada misión a Notion automáticamente.

## Estética definida
- **Transparente** — fondo `transparent` para mimetizarse con Notion
- **Tipografía**: `Playfair Display` (serif elegante) + `DM Mono` (datos/labels)
- **3 temas**: Oscuro (default), Claro, Sépia/Editorial
- **Colores oscuro**: texto `#e3e3e3`, accent `#d4c5a0` (dorado hueso)
- **Sin bordes, sin sombras, sin marcos** — minimalista editorial
- El switcher de tema son 3 puntitos pequeños arriba a la izquierda
- **Estado Hueco**: cuando Humanidad=0, el HUD muta a paleta gris-frío (sin dorado)

## Variables de entorno en Vercel
- `NOTION_TOKEN` — Internal Integration Token de Notion (de la integración Make automatización)

## IDs de bases de datos Notion (USAR DATABASE_ID, NO DATA_SOURCE_ID)
| Base de datos | database_id (público, en URL) | data_source_id (interno, NO usar en API) |
|---------------|-------------------------------|------------------------------------------|
| 🧙 Personaje | `9be62f8e75094d0e8e9be41e96eeb8ca` | `d04682b9-66f4-4c24-8362-d2896c7d1b8e` |
| 📊 Stats | `4abc659f8b144de99e8900fa1478964f` | `2508f8a9-fc4b-4a6f-9e1e-50d31f2ce71b` |
| 📅 Registro Diario | `4d07427278354af79dbb0b3091d42f77` | `19a27bda-534c-4204-914e-86602ac2d28e` |
| ⚔️ Misiones | `94334b895c7647b18e9102598bd4f5f8` | `9bed4fc3-6871-4ebe-97d2-6f03b82cf915` |
| 📋 Catálogo de Hábitos | `8e3fc249c044496ba815fde16c96d1f9` | `a01a7ce7-014c-431c-93cb-85ecefd3fa53` |

Page ID del personaje principal (Paco): `357e89bc-3fee-81f7-a707-ccdde4a842ce`

## Mecánicas RPG implementadas

### XP / Nivel / Rango
- Cada hábito tiene `XP Valor` (number)
- Al marcar `Estado = ✅ Completado`, suma XP a la stat correspondiente
- Cada 500 XP = 1 nivel
- 8 rangos: 💀 Iniciado → 👑 Leyenda

### Humanidad (5 pips, cap 0–5)
- Inicial: 5
- **Cae −1**: al marcar un Prohibido como ❌ Omitido (automático via /api/habit-toggle)
- **Sube +1**: revertir Omitido en Prohibido (automático). Reglas manuales pendientes: misión Épica completada, racha 3 días limpios.
- Estados:
  - `🪙 Humano` — Humanidad ≥ 5
  - `🩸 Maldito` — Humanidad 1–4
  - `💀 Hueco` — Humanidad = 0 (HUD pasa a paleta gris)

### Hábitos Prohibidos (campo Tipo en Catálogo)
- `🟢 Construir` — hábitos positivos a hacer (10 actuales)
- `🔴 Prohibido` — hábitos negativos a evitar (Mente clara, Sin azúcar)
- Para Prohibidos: ✅ Completado significa "lo evité hoy" (positivo, +XP). ❌ Omitido = "caí" (negativo, -1 humanidad).

### Frecuencia (campo en Catálogo)
- `📅 Diario` — Make crea entrada cada mañana
- `📆 Semanal` — usuario crea registro manualmente cuando lo hace
- `🎯 Eventual` — sin patrón, manual

### Veces Target (campo en Misiones)
- Para misiones streak/count: define cuántas veces hay que cumplir hábitos asociados
- `Progreso = completadosTotal / Veces Target × 100` (capeado a 100)
- Sin Veces Target: fallback a `xpAcumulado / xpTargetRound` (impreciso para streaks)

## Filtro Make (escenario diario)
Hoy a las 6 AM, Make hace Search en Catálogo con filtro:
- `Activo = ✅ Activo` AND `Frecuencia = 📅 Diario`
Resultado: solo crea entradas en Registro Diario para hábitos diarios activos.

## Cómo agregar un nuevo widget
1. Crear `nombre.html` en la raíz del proyecto
2. Si necesita nuevos datos de Notion, crear `api/nombre.js`
3. Agregar la ruta en `vercel.json`:
   `{ "source": "/nombre", "destination": "/nombre.html" }`
4. Commit y push — Vercel redesplega automáticamente
5. Embeber en Notion con `/embed` → URL: `widgetradar.vercel.app/nombre`

## Sistema de Notion (contexto completo)
El sistema es un tracker de hábitos gamificado con estética Dark Souls.
- **Make** crea 10 entradas en Registro Diario cada mañana a las 6am (filtrando Diarios + Activos)
- El usuario marca hábitos como ✅ Completado / ❌ Omitido
- XP sube automáticamente en la DB Personaje via rollups
- Humanidad sube/baja automáticamente vía /api/habit-toggle
- Hub principal: https://www.notion.so/lacasitadelmolde/Quest-Log-357e89bc3fee81cd9729feb0d4bac8d0

## Historial — Bug XP Total (resuelto May 2026)
Causa raíz: el rollup `XP Hábitos Auto` apuntaba a la DB ⚡ Hábitos Diarios
que estaba en la papelera. La API de Notion devolvía null para ese rollup.
Fix aplicado:
- Notion: eliminadas las propiedades `XP Hábitos Auto` y `Hábitos completados`
  de la DB Personaje. Los 145 XP históricos se hardcodearon en `XP Hábitos`.
- Código: `api/stats.js` suma manualmente todos los componentes en lugar de
  depender de la fórmula `XP Total` de Notion.
- DBs en papelera: ⚡ Hábitos Diarios + 🏗️ Habitos (purgar cuando convenga).

## Referencia estética Dark Souls (para PWA futura)
- CodePen: https://codepen.io/frvnciscx/full/GgNpZpa
- GitHub Pages: https://frvnciscx.github.io/life-dashboard/

## Lecciones operativas (errores reincidentes a evitar)

### Notion API
- **El ID de DB que va en `/v1/databases/{id}/query` es el `database_id` (URL del navegador), NO el `data_source_id`** (`collection://...`). En DBs multi-source son distintos.
- **Mover una DB cambia su scope de permisos.** Las integraciones conectadas vía herencia (página padre) se pierden al mover al root. Reconectar Make explícitamente a cada DB suelta.
- **Rollups que apuntan a DBs en papelera devuelven `null` en API** mientras la UI muestra el cache.
- **Filtros relativos `today` no existen en la API** (sí en UI). Calcular fecha en backend con `Intl.DateTimeFormat.formatToParts` + `timeZone` explícita.
- **La API no soporta crear embeds externos** vía content updates. Solo embeds internos a páginas Notion. Embeds externos requieren UI manual con `/embed`.
- **Eliminar permanentemente desde la papelera no se puede vía API**. Solo el usuario en la UI.
- **Multi-hop rollups (rollup-of-rollup) bloqueado por Notion**: error explícito `Cannot create a rollup of a related rollup property`. Calcular en backend cruzando DBs.
- **Fórmulas con `.map(...)` sobre relations dan Type error vía DDL**, aunque la UI las acepta. Calcular en backend.

### Código
- **Antes de pedir un widget nuevo, abrir los existentes y revisarlos.** Riesgo: duplicar funcionalidad.
- **No confiar en propiedades intermedias de Notion (fórmulas/rollups) como fuente de verdad.** Sumar manualmente desde componentes individuales en el backend si la lógica es crítica.
- **Endpoints POST que mutan datos requieren auth si la URL puede filtrarse.**
- **Cuando un endpoint devuelve `[]`, distinguir entre lista vacía y error.**
- **Resolver nombres desde el Catálogo (live)**, no desde el title histórico del Registro. Permite renombrar hábitos sin romper la UI.

### Proceso (trabajar con el asistente)
- **Cuando un asistente AI hace cambios estructurales en herramientas críticas, hacer checkpoint antes y diff después.**
- **Validar la memoria contra la fuente actual antes de decir "está mal".**
- **Pedir el dato crudo (JSON, screenshot) en el primer turn de debug, no esperar a iterar.**
- **El asistente debe verificar IDs/URLs/sintaxis contra la fuente real (MCP/web) antes de codificar.**
- **No agregar features sin uso comprobado.** Probar 7 días antes de capa nueva.
