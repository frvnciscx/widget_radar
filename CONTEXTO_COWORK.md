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
│   ├── stats.js          ← Lee DB Personaje + DB Stats (con bypass de rollups rotos)
│   ├── registro.js       ← GET hábitos del día (filtro Fecha=hoy, TZ México)
│   ├── habit-toggle.js   ← POST cambiar estado de un hábito (PATCH a Notion)
│   └── debug.js          ← Muestra raw JSON de Notion para debugging
├── index.html            ← Radar de stats (widget activo)
├── personaje.html        ← HUD de nivel/XP/rango (widget activo)
├── registro.html         ← Check-in diario interactivo (widget activo)
├── vercel.json           ← Rutas de Vercel
└── package.json
```

## Widgets activos
| Widget | URL | Descripción |
|--------|-----|-------------|
| Radar de stats | `widgetradar.vercel.app` | Radar chart con 5 stats + barras |
| HUD Personaje | `widgetradar.vercel.app/personaje` | Nivel, XP, Rango, barra de progreso |
| Check-in diario | `widgetradar.vercel.app/registro` | Hábitos del día con botones ⬜/✅/❌ interactivos |

## Widgets pendientes por construir
| Widget | Descripción |
|--------|-------------|
| Misiones activas | Lista de misiones con progreso |
| Racha diaria | Días consecutivos de hábitos |

## Estética definida
- **Transparente** — fondo `transparent` para mimetizarse con Notion
- **Tipografía**: `Playfair Display` (serif elegante) + `DM Mono` (datos/labels)
- **3 temas**: Oscuro (default), Claro, Sépia/Editorial
- **Colores oscuro**: texto `#e3e3e3`, accent `#d4c5a0` (dorado hueso)
- **Sin bordes, sin sombras, sin marcos** — minimalista editorial
- El switcher de tema son 3 puntitos pequeños arriba a la izquierda

## Variables de entorno en Vercel
- `NOTION_TOKEN` — Internal Integration Token de Notion (empieza con `ntn_`)

## IDs de bases de datos Notion
| Base de datos | ID |
|---------------|-----|
| 🧙 Personaje | `9be62f8e75094d0e8e9be41e96eeb8ca` |
| 📊 Stats | `4abc659f8b144de99e8900fa1478964f` |
| 📅 Registro Diario | `4d07427278354af79dbb0b3091d42f77` (database_id) — `19a27bda-534c-4204-914e-86602ac2d28e` es el data_source_id, NO usar en API |
| ⚔️ Misiones | `94334b895c7647b18e9102598bd4f5f8` |
| 📋 Catálogo de Hábitos | `a01a7ce7-014c-431c-93cb-85ecefd3fa53` |

## Historial — Bug XP Total (resuelto May 2026)
Causa raíz: el rollup `XP Hábitos Auto` apuntaba a la DB ⚡ Hábitos Diarios
que estaba en la papelera. La API de Notion devolvía null para ese rollup.
Fix aplicado:
- Notion: eliminadas las propiedades `XP Hábitos Auto` y `Hábitos completados`
  de la DB Personaje. Los 145 XP históricos se hardcodearon en `XP Hábitos`.
- Código: `api/stats.js` suma manualmente todos los componentes en lugar de
  depender de la fórmula `XP Total` de Notion. Incluye fallback con
  `pages.properties` paginado para rollups truncados.
- DBs en papelera: ⚡ Hábitos Diarios + 🏗️ Habitos (purgar cuando convenga).

## Cómo agregar un nuevo widget
1. Crear `nombre.html` en la raíz del proyecto
2. Si necesita nuevos datos de Notion, crear `api/nombre.js`
3. Agregar la ruta en `vercel.json`:
   `{ "source": "/nombre", "destination": "/nombre.html" }`
4. Commit y push — Vercel redesplega automáticamente
5. Embeber en Notion con `/embed` → URL: `widgetradar.vercel.app/nombre`

## Sistema de Notion (contexto completo)
El sistema es un tracker de hábitos gamificado con estética Dark Souls.
- **Make** crea 10 entradas en Registro Diario cada mañana a las 6am
- El usuario marca hábitos como ✅ Completado
- XP sube automáticamente en la DB Personaje via rollups
- Hub principal: https://www.notion.so/lacasitadelmolde/Quest-Log-357e89bc3fee81cd9729feb0d4bac8d0

## Referencia estética Dark Souls (para PWA futura)
- CodePen: https://codepen.io/frvnciscx/full/GgNpZpa
- GitHub Pages: https://frvnciscx.github.io/life-dashboard/

## Lecciones operativas (errores reincidentes a evitar)

### Notion API
- **El ID de DB que va en `/v1/databases/{id}/query` es el `database_id` (URL del navegador), NO el `data_source_id`** (`collection://...`). En DBs multi-source son distintos. Si el endpoint da 404 con conexión válida, verificar que el ID coincida con `notion.so/{ID}`.
- **Mover una DB cambia su scope de permisos.** Las integraciones conectadas vía herencia (página padre) se pierden al mover al root. Reconectar Make/integration explícitamente a cada DB suelta.
- **Rollups que apuntan a DBs en papelera devuelven `null` en API** mientras la UI muestra el cache. Si un cálculo da menos de lo esperado, revisar rollups con `null` y la papelera.
- **Filtros relativos `today` no existen en la API** (sí en UI). Calcular fecha en backend con `Intl.DateTimeFormat.formatToParts` + `timeZone` explícita. `toLocaleDateString` puede variar entre runtimes.
- **La API no soporta crear embeds externos** vía content updates. Solo embeds internos a páginas Notion. Embeds de iframes externos (Vercel, etc.) los agrega el usuario manualmente con `/embed`.
- **Eliminar permanentemente desde la papelera no se puede vía API**. Solo el usuario en la UI.

### Código
- **Antes de pedir un widget nuevo, abrir los existentes y revisarlos.** Riesgo: duplicar funcionalidad (ej. `index.html` ya muestra las 5 barras → no hace falta `stats.html`).
- **No confiar en propiedades intermedias de Notion (fórmulas/rollups) como fuente de verdad.** Sumar manualmente desde componentes individuales en el backend si la lógica es crítica.
- **Endpoints POST que mutan datos requieren auth si la URL puede filtrarse.** Para uso privado individual sin compartir embed, no es crítico. Para embeds compartidos, agregar header secreto.
- **Cuando un endpoint devuelve `[]`, distinguir entre lista vacía y error.** Mostrar el `error` real en el frontend, no asumir "sin resultados".

### Proceso (trabajar con el asistente)
- **Cuando un asistente AI hace cambios estructurales en herramientas críticas (Notion, GitHub, infra), hacer checkpoint antes y diff después.** Si no, capas nuevas se construyen sobre cimientos rotos. Lo que cuesta 5 min de revisión te ahorra 2 hs de debug.
- **Validar la memoria contra la fuente actual antes de decir "está mal".** El "260 XP" del bug original era memoria desactualizada, no un valor presente en Notion.
- **Pedir el dato crudo (JSON, screenshot) en el primer turn de debug, no esperar a iterar.** Acelera el diagnóstico.
- **El asistente debe verificar IDs/URLs/sintaxis contra la fuente real (MCP/web) antes de codificar**, no asumir desde contexto previo. Aplica especialmente a IDs de Notion, sintaxis de embeds, y nombres de propiedades.
