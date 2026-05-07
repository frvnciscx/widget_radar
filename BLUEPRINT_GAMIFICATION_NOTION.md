# Quest Log — Sistema de Gamificación de Vida en Notion

> Blueprint reutilizable para construir un sistema RPG de hábitos y objetivos personales sobre Notion, con backend de cálculo en Vercel y widgets interactivos. Inspiración estética y mecánica: Dark Souls.

**Versión**: 1.0 — Mayo 2026  
**Autor**: paco / Forja 3D  
**Repo de referencia**: `frvnciscx/widget_radar` · `widgetradar.vercel.app`

---

## Tabla de contenidos

1. [Filosofía del sistema](#1-filosofía-del-sistema)
2. [Visión general](#2-visión-general)
3. [Arquitectura de datos](#3-arquitectura-de-datos-5-dbs)
4. [Setup en Notion paso a paso](#4-setup-en-notion-paso-a-paso)
5. [Mecánicas RPG](#5-mecánicas-rpg)
6. [Stack técnico opcional](#6-stack-técnico-opcional-vercel--make)
7. [Reglas operativas (lecciones)](#7-reglas-operativas-lecciones-aprendidas)
8. [Roadmap de comercialización](#8-roadmap-de-comercialización)
9. [Diferenciador vs competencia](#9-diferenciador-vs-templates-existentes)

---

## 1. Filosofía del sistema

**Lo que es:**
- Tracking honesto de hábitos y misiones de vida
- Mecánica de juego con consecuencias reales (positivas y negativas)
- Métricas medibles que reflejan realidad, no aspiración
- Sistema que **te castiga cuando fallás**, no solo te felicita cuando cumplís

**Lo que NO es:**
- Auto-trofeo: redefinir hábitos para que "todo cuente"
- Tracking puro decorativo (anotar y nunca mirar)
- Templates estéticos sin profundidad mecánica

**Reglas operativas innegociables:**
1. Cada stat debe tener **al menos 1 hábito activo que la alimente**. Si no, eliminala — no es una stat, es decoración.
2. Cada misión debe tener **métrica medible** (ej: "30 días de X", "12 libros", "100 sesiones"). Sin métrica, es aspiración.
3. **Cada feature agregada es deuda futura.** Probar 7 días antes de agregar capa nueva.
4. **No mientas.** Si un hábito está al 100% pero solo lo hiciste 1 vez en 30 días, hay un bug de diseño, no de motivación.

---

## 2. Visión general

```
┌─────────────────────────────────────────────────────────┐
│              📋 Catálogo de Hábitos                     │
│  Lista maestra. XP Valor, Stat, Frecuencia, Tipo        │
└──────────────┬──────────────────────────────┬───────────┘
               │ relation                     │ relation
               ▼                              ▼
┌──────────────────────────┐     ┌──────────────────────────┐
│   📅 Registro Diario      │     │     ⚔️ Misiones          │
│  Make crea cada mañana    │     │  Objetivos largo plazo   │
│  Estado: ⬜/✅/❌          │     │  Veces Target            │
└──────────┬───────────────┘     └──────────────────────────┘
           │ rollup XP                          
           ▼                                    
┌─────────────────────────────────────────────────────────┐
│                    🧙 Personaje                          │
│  XP Total · Nivel · Rango · Humanidad · Estado          │
└─────────────────────────┬───────────────────────────────┘
                          │ rollup por categoría
                          ▼
                ┌─────────────────────┐
                │     📊 Stats         │
                │  Físico · Mente ·    │
                │  Nutrición · etc.    │
                └─────────────────────┘
```

**Flujo de un día típico:**
1. **6:00 AM** — Make crea entradas del día en Registro Diario (1 por hábito Diario activo)
2. **Durante el día** — usuario marca ✅ Completado / ❌ Omitido en cada hábito (web, mobile, widget)
3. **Al marcar** — XP suma automático en Stats vía rollups; Humanidad cae si fue Prohibido
4. **23:00 / Cron** — endpoint de sync recalcula progreso de cada Misión y lo escribe en Notion

---

## 3. Arquitectura de datos (5 DBs)

### 📋 Catálogo de Hábitos
**Propósito**: lista maestra de qué se puede hacer, valor en XP, qué stat alimenta.

| Propiedad | Tipo | Notas |
|-----------|------|-------|
| Hábito | title | Nombre con emoji (ej: `💪 Sesión de ejercicio`) |
| Stat | select | 5 opciones (tu elección) — define qué stat sube |
| Categoría | select | Agrupador visual (Ejercicio, Aprendizaje, etc.) |
| XP Valor | number | Sugerencia: 10 (corto), 15 (medio), 20-25 (alto) |
| Activo | select | `✅ Activo` / `⏸️ Pausado` |
| Frecuencia | select | `📅 Diario` / `📆 Semanal` / `🎯 Eventual` |
| Tipo | select | `🟢 Construir` (hacer) / `🔴 Prohibido` (evitar) |
| Misiones | relation (dual) | A qué misiones contribuye |
| Registros | relation | A las entradas de Registro Diario |

### 📅 Registro Diario
**Propósito**: una entrada por hábito por día. Es donde se marca el cumplimiento real.

| Propiedad | Tipo | Notas |
|-----------|------|-------|
| Entrada | title | Texto del hábito (Make lo copia del Catálogo) |
| Estado | select | `⬜ Pendiente` / `✅ Completado` / `❌ Omitido` |
| Fecha | date | El día al que aplica |
| Hábito Ref | relation | Vincula al hábito del Catálogo |
| Personaje | relation | Vincula al Personaje (1 si solo vos, varios si app multi-user) |
| Stat Ref | relation | A la DB Stats (para rollup por categoría) |
| XP Base | rollup | Trae XP Valor del Catálogo via Hábito Ref |
| XP Ganado | formula | `if(prop("Estado") == "✅ Completado", prop("XP Base"), 0)` |

### 🧙 Personaje
**Propósito**: tu ficha gamificada. Acumula XP via rollups, calcula nivel/rango/humanidad.

| Propiedad | Tipo | Notas |
|-----------|------|-------|
| Nombre | title | Tu nombre o alter-ego del juego |
| Clase | text | Descriptiva (ej: "Bearer of the Curse") |
| XP Físico/Mente/Nutrición/etc. | number | XP manual histórico (5 props, una por stat) |
| XP Auto | rollup | Sum de `XP Ganado` via Registros diarios |
| XP Total | formula | Suma de todos los XP (manual + auto) |
| Nivel | formula | `floor(prop("XP Total") / 500) + 1` |
| Rango | formula | Etiqueta según nivel (8 escalones) |
| Barra XP | formula | Visualización con caracteres ▰▱ |
| **Humanidad** | number | Default 5, cap 0–5 |
| **Estado Personaje** | formula | `if(Humanidad >= 5, "🪙 Humano", if(Humanidad > 0, "🩸 Maldito", "💀 Hueco"))` |
| Registros diarios | relation | A todos los registros del personaje |

### 📊 Stats
**Propósito**: 5 atributos del personaje. Cada uno acumula XP de su categoría.

| Propiedad | Tipo |
|-----------|------|
| Stat | title (ej: `💪 Físico`) |
| Registros | relation a Registro Diario |
| XP Total Stat | rollup sum de `XP Ganado` filtrado por Stat Ref |

### ⚔️ Misiones
**Propósito**: objetivos de mediano y largo plazo, vinculados a hábitos que las avanzan.

| Propiedad | Tipo |
|-----------|------|
| Misión | title |
| Tipo | select: Principal / Secundaria / Diaria / Jefe Final |
| Categoría | select: 5 stats + Personal |
| Estado | select: 🔒 Bloqueada / 🔥 Activa / ⚔️ En progreso / ✅ Completada / 💀 Abandonada |
| Dificultad | select: ⭐ → 💀 Épica |
| XP Recompensa | number |
| Progreso | number 0–100 (escrito por sync endpoint) |
| **Veces Target** | number | Cuántas veces hay que cumplir hábitos asociados (target real para misiones streak) |
| Hábitos asociados | relation dual al Catálogo |
| Fecha límite | date (opcional) |
| Notas | text |

---

## 4. Setup en Notion paso a paso

**Orden importante** (las relations requieren que ambas DBs existan primero):

1. Crear las 5 DBs vacías con sus propiedades básicas (sin relations).
2. Crear las relations en este orden:
   - Catálogo ↔ Registro Diario (vía `Registros` / `Hábito Ref`)
   - Personaje ↔ Registro Diario (vía `Registros diarios` / `Personaje`)
   - Stats ↔ Registro Diario (vía `Registros` / `Stat Ref`)
   - **Catálogo ↔ Misiones** (dual: `Misiones` / `Hábitos asociados`)
3. Crear las fórmulas (XP Ganado, XP Total, Nivel, Rango, Barra XP, Estado Personaje).
4. Crear los rollups (XP Auto en Personaje, XP Total Stat en Stats, Veces Target en Misiones).
5. Crear el personaje principal con `Humanidad = 5`.
6. Llenar el Catálogo con tus hábitos iniciales (recomendado: 8–12 para empezar).
7. Crear vistas en Registro Diario:
   - **Hoy**: filtro `Fecha is today`
   - **Default**: tabla con todas las entradas

---

## 5. Mecánicas RPG

### XP / Nivel / Rango (8 escalones)

```
Nivel 1 — 💀 Iniciado     —    0 XP
Nivel 2 — 🗡️ Aprendiz     —  500 XP
Nivel 3 — 📖 Practicante  — 1000 XP
Nivel 4 — 🛡️ Especialista — 1500 XP
Nivel 5 — 💎 Experto      — 2000 XP
Nivel 6 — 🔥 Maestro      — 2500 XP
Nivel 7 — ⚔️ Gran Maestro — 3000 XP
Nivel 8 — 👑 Leyenda      — 3500 XP
```

### Humanidad (mecánica original — diferenciador)

- Pool inicial: **5**
- **Pierde 1** cuando marcás un Hábito Prohibido como `❌ Omitido` (= "caí, lo hice")
- **Recupera 1** si revertís ese Omitido a otro estado (anti-doble-conteo)
- Cap inferior: 0 · Cap superior: 5

**Visualización en widgets:**
- 5 pips visuales (●●●●●)
- Estado textual: `🪙 Humano` (5) / `🩸 Maldito` (1–4) / `💀 Hueco` (0)
- En Hueco, todo el HUD muta a paleta gris-frío (sin dorado)

**Reglas adicionales (manuales por ahora):**
- +1 al completar misión `💀 Épica`
- +1 al mantener racha de 3 días sin caer en ningún Prohibido
- −1 al fallar 3+ hábitos diarios mismo día

### Hábitos Prohibidos (cubre dimensión "evitar")

La mayoría de habit trackers solo modelan "cosas que querés hacer". Este sistema agrega **"cosas que querés DEJAR de hacer"**:

- En el Catálogo, propiedad `Tipo`: `🟢 Construir` o `🔴 Prohibido`
- Para Prohibidos, el lenguaje se invierte:
  - `✅ Completado` = "lo evité hoy" (positivo, suma XP)
  - `❌ Omitido` = "caí, lo hice" (negativo, −1 Humanidad)
- Ejemplos: "Sin azúcar", "Sin scroll redes >30min", "Sin alcohol entre semana"

### Frecuencia (resuelve hábitos no-diarios)

```
📅 Diario     — Make crea entrada cada mañana
📆 Semanal    — usuario crea registro manualmente cuando lo hace (ej: post en redes 1×/semana)
🎯 Eventual   — sin patrón, manual (ej: viaje a Buenos Aires)
```

Make filtra: solo crea entradas para `Frecuencia = 📅 Diario` AND `Activo = ✅ Activo`.

### Veces Target en Misiones (progreso honesto)

Notion API NO permite multi-hop rollups (`rollup of rollup`). Por eso el progreso de misiones se calcula en backend:

- Si la misión tiene `Veces Target > 0`:  
  `progreso = completadosTotal / Veces Target × 100` (capeado a 100)
- Sin `Veces Target`: fallback a `xpAcumulado / xpTargetRound`. Para misiones con un solo hábito asociado y completarlo 1 vez, esto da 100% engañoso. **Recomendado**: definir Veces Target explícitamente.

**Ejemplos honestos:**
- "30 días de lectura" → `Veces Target = 30`
- "12 libros" → `Veces Target = 24` (estimando 2 sesiones por libro)
- "Construir cuerpo de guerrero" → `Veces Target = 90` (3 meses, 3×/semana)

---

## 6. Stack técnico opcional (Vercel + Make)

### Make automation (escenario diario)

**Trigger**: 6:00 AM zona del usuario  
**Steps:**
1. **Notion → Search Objects** en Catálogo de Hábitos  
   Filtros: `Activo = ✅ Activo` AND `Frecuencia = 📅 Diario`
2. **Iterator** sobre los hábitos resultantes
3. **Notion → Create Data Source Item** en Registro Diario:
   - Entrada: `{plain_text del hábito}`
   - Hábito Ref: `{page_id del hábito}`
   - Estado: `⬜ Pendiente`
   - Fecha: `formatDate(now; "YYYY-MM-DD")`

**Nota**: el campo Personaje no se puede asignar via Make (limitación API Notion). El XP se suma vía rollup directo sin necesitar esa relation.

### Vercel Serverless Functions

| Endpoint | Método | Función |
|----------|--------|---------|
| `/api/stats` | GET | Personaje + Stats + Humanidad + Estado |
| `/api/registro` | GET | Hábitos del día (resuelve nombres del Catálogo, filtra pausados) |
| `/api/habit-toggle` | POST | Cambia estado + auto-decremento Humanidad si Prohibido |
| `/api/misiones` | GET | Progreso real cruzando 3 DBs |
| `/api/sync-misiones` | GET/POST | Escribe Progreso a Notion (manual o cron) |

**Variables de entorno**: `NOTION_TOKEN` (de la integration interna).

### Cron Job (vercel.json)

```json
"crons": [
  { "path": "/api/sync-misiones", "schedule": "0 5 * * *" }
]
```

5:00 UTC = 23:00–00:00 México (depende de DST). Vercel free tier permite 1 cron diario.

### Widgets HTML embebibles

Estética común: Playfair Display + DM Mono, dorado hueso `#d4c5a0`, transparente, 3 temas (oscuro/claro/sépia).

- **Radar de stats** (`/`): radar chart SVG + 5 barras horizontales
- **HUD Personaje** (`/personaje`): nivel grande, barra XP, **5 pips de Humanidad**, estado (Humano/Maldito/Hueco)
- **Check-in del día** (`/registro`): lista interactiva con 3 botones por hábito, optimistic update + rollback en error

---

## 7. Reglas operativas (lecciones aprendidas)

### Notion API gotchas
- **`database_id` ≠ `data_source_id`**. La API estándar usa el de la URL del navegador, no el `collection://...` interno.
- **Mover una DB pierde permisos heredados.** Reconectar la integration explícitamente.
- **Multi-hop rollups bloqueados**: error explícito `Cannot create a rollup of a related rollup property`. Calcular en backend.
- **Fórmulas con `.map()` sobre relations dan Type error vía DDL**, aunque la UI las renderiza. Calcular en backend.
- **Filtros `today` relativos no existen en API.** Calcular fecha en backend con TZ explícita.
- **Embeds externos no se crean vía API**. Solo embeds internos a páginas Notion. Iframes externos requieren `/embed` manual.
- **Rollups que apuntan a DBs en papelera devuelven `null`** mientras la UI muestra cache.

### Diseño
- **Cada stat necesita ≥1 hábito que la alimente**. Sino es decoración.
- **Cada misión necesita Veces Target** o aceptás cálculo impreciso.
- **Resolver nombres desde el Catálogo (live)**, no desde el title histórico del Registro. Permite renombrar sin romper UI.
- **Endpoints POST que mutan datos** requieren auth si la URL puede filtrarse a terceros.

### Antipatterns que matan la motivación
- **Misiones aspiracionales sin métrica** → quedan en 0% perpetuo y desmotivan
- **Hábitos sin marcar consistentemente** → el sistema se vuelve teatro
- **Múltiples capas sin probar** → deuda visual y mental
- **100% engañoso** (sin Veces Target) → el sistema te miente y dejás de creerle

### Trabajando con asistentes AI
- **Checkpoint antes, diff después** de cualquier cambio estructural en herramientas críticas.
- **Validar memoria contra fuente actual** antes de afirmar que algo está mal.
- **Pedir el dato crudo (JSON/screenshot)** en el primer turn de debug.
- **Verificar IDs/sintaxis contra fuente real** antes de codificar.

---

## 8. Roadmap de comercialización

### Tier 1 — MVP free (Notion template puro)
**Qué incluye:**
- Las 5 DBs con relations, fórmulas y rollups configurados
- Documentación de uso (este README)
- 10 hábitos de ejemplo precargados
- 5 misiones de ejemplo

**Distribución:** notion-template marketplaces (gumroad, notion gallery), Twitter, blog post.  
**Precio:** $0 (lead magnet).  
**Conversión esperada:** uso vs comercialización paid (5–10%).

### Tier 2 — Pro template (USD 29–49 una vez)
**Lo de Tier 1 +:**
- Repo de Vercel widgets (HUD, check-in, radar)
- Setup guide de Make automation
- Onboarding en video (15 min)
- Soporte por email 30 días

**Diferencial vs free:** widgets en vivo dentro de Notion (UX superior a tablas), automatización de creación diaria.

### Tier 3 — Servicio gestionado (USD 9–15/mes)
**Lo de Tier 2 +:**
- Hosting administrado (no requiere Vercel propio)
- Sync automático sin configurar Make
- Dashboard web fuera de Notion para reportes
- Backups y exports

**Mercado objetivo:** usuarios serios que no quieren tocar código.

### Tier 4 — Coaching 1-on-1 (USD 100–300/mes)
**Lo de Tier 3 +:**
- Configuración personalizada del sistema (calibración inicial)
- Sesiones mensuales de revisión y ajuste de targets
- Acceso prioritario a roadmap

**Mercado objetivo:** profesionales/emprendedores con disposición a pagar por estructura.

### Métricas de validación antes de invertir en build
- ¿Hay 50 personas pagando $29 por Tier 2 antes de invertir en Tier 3?
- ¿El churn de Tier 3 es <10% mensual? Si no, el sistema no genera valor recurrente.
- ¿Los usuarios que pagan **realmente lo usan diariamente**? (telemetría anónima del widget de check-in).

---

## 9. Diferenciador vs templates existentes

La mayoría de "habit tracker en Notion" son:

| Templates típicos | Este sistema |
|---|---|
| Tracking puro sin mecánica | Mecánica de juego con consecuencias (Humanidad) |
| XP decorativo sin fórmula real | XP via rollups + nivel/rango calculados |
| Solo "cosas que hacer" | Construir + Prohibido (cubre evitar) |
| Tablas estáticas | Widgets interactivos en vivo |
| Datos solo en Notion | API + sync bidireccional |
| Streak romántico (todo o nada) | Veces Target honesto (progreso medible) |

**3 ideas únicas que no encontrás en otros templates:**

1. **Humanidad como recurso narrativo**: castiga falla en Prohibidos, se recupera con disciplina. Le da peso emocional al sistema (te importa no caer).
2. **Hábitos Prohibidos como tipo formal**: los demás templates te hacen escribir "Sin azúcar" como hábito normal y te confunden con la lógica al revés. Aquí está formalizado en el modelo de datos.
3. **Honestidad numérica**: el cálculo `Veces Target` evita el "100% en 3 días" engañoso de otros sistemas. Aceptás barras pequeñas que reflejan realidad.

---

## Apéndice: Snippets de código clave

### Filtro Make
```
Activo = ✅ Activo  AND  Frecuencia = 📅 Diario
```

### Fórmula `XP Ganado` (Registro Diario)
```javascript
if(prop("Estado") == "✅ Completado", prop("XP Base"), 0)
```

### Fórmula `Estado Personaje` (Personaje)
```javascript
if(prop("Humanidad") >= 5, "🪙 Humano", if(prop("Humanidad") > 0, "🩸 Maldito", "💀 Hueco"))
```

### Fórmula `Barra XP` (Personaje)
```javascript
let(xp, prop("XP Total"), lvl, floor(xp / 500), cur, xp - (lvl * 500),
  "Nv." + format(lvl + 1) + " " +
  "▰".repeat(floor(cur / 50)) +
  "▱".repeat(10 - floor(cur / 50)) +
  " " + format(cur) + "/500 XP")
```

### Cálculo de progreso (backend)
```javascript
const progresoFinal = vecesTarget > 0
  ? Math.min(100, Math.round((completadosTotal / vecesTarget) * 100))
  : Math.min(100, Math.round((xpAcumulado / xpTargetRound) * 100));
```

---

## Licencia y atribución

Este blueprint puede ser utilizado, modificado y comercializado libremente.  
Si lo usás como base de un producto comercial, una mención en docs/about es apreciada pero no obligatoria.

**Contacto**: paco / fvazquez@procomi.com  
**Repo de referencia**: github.com/frvnciscx/widget_radar
