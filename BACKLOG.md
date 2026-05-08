# BACKLOG — Quest Log

> Roadmap de features pendientes. Cada idea con análisis de valor real vs esfuerzo, y prioridad sugerida.  
> **Regla principal**: validar 30 días de uso real antes de implementar features narrativas. La complejidad sin uso es deuda.

**Última actualización**: 8 de mayo 2026

---

## 🔥 Sprint 1 — Implementado en esta sesión

### Hogueras (excepciones autorizadas)
- ✅ Campo `Hogueras` (number) en Personaje, default 4
- ✅ `/api/habit-toggle` soporta `useHoguera: true` → resta 1 hoguera en lugar de 1 humanidad
- ✅ `/api/stats` expone `hogueras` y `hogueras_max`
- ✅ Widget `/registro` muestra contador "🔥 X/4" + botón 🔥 en hábitos Prohibidos
- ✅ Reset semanal: cada lunes en `cron-daily` setea hogueras = 4

**Mecánica narrativa**: en Dark Souls la hoguera es donde descansás conscientemente. Acá representa **excepciones autorizadas a tus Prohibidos** (cumpleaños, vacaciones, eventos). Limitadas a 4 por semana — si las gastás todas, las próximas caídas vuelven a costar humanidad.

---

## 🟡 Sprint 2 — Próximo (cuando estés en Nivel 2-3)

### Misiones secundarias futuras (sin código)
**Esfuerzo**: 30 segundos. **Valor**: Medio.

Crear vista en DB Misiones con filtro `Estado = 🔒 Bloqueada`. Allí vas almacenando ideas de misiones futuras. Las activás cuando el momento sea. Sin código nuevo.

Ideas iniciales:
- 🗡️ "Disciplina de Caballero" — racha 14 días sin caer en NINGÚN Prohibido (Veces Target = 14, Difficult ⭐⭐⭐)
- 🗡️ "Forja del Cuerpo" — 60 sesiones de ejercicio (Veces Target = 60)
- 💀 "Maestría del Aprendizaje" — 100 sesiones de lectura (Épica)

### Reto semanal manual
**Esfuerzo**: Bajo (sin código). **Valor**: Alto si lo hacés.

Cada lunes, setearte 1 reto extra para la semana. Ej: "Esta semana 0 caídas en Sin azúcar = +50 XP bonus". Lo registrás manual en una vista nueva o en Notas del Personaje.

Si lo cumplís → sumás XP a mano. Si no automatizás todavía, ya sirve.

### +1 Humanidad por racha de 3 días limpios
**Esfuerzo**: Medio. **Valor**: Alto si lográs rachas.

Implementación: en `cron-daily` chequear los últimos 3 registros de cada Prohibido. Si NINGUNO está en `❌ Omitido`, sumar +1 a Humanidad (con campo `Última Racha Bonus` para anti-doble-conteo).

### −1 Humanidad por fallar 3+ hábitos diarios
**Esfuerzo**: Bajo-Medio. **Valor**: Bajo (rara vez fallás 3 hábitos en un día).

Implementación: al final del día (cron) contar `Estado = ❌ Omitido` de hoy. Si ≥ 3, restar 1 humanidad.

---

## 🟢 Sprint 3 — Cuando llegues a Nivel 4-5

### Niveles 9-12 con narrativa coherente
**Esfuerzo**: Bajo (solo cambiar fórmula Rango). **Valor**: Bajo hoy (estás en Nivel 1).

Propuesta de extensión:
```
Nivel 9  — 🌑 Sin Llama          — 4000 XP
Nivel 10 — 🔥 Portador del Fuego — 4500 XP
Nivel 11 — 🌟 Caminante Etereo   — 5000 XP
Nivel 12 — ♾️ Eterno             — 6000 XP
```

### Retos diarios (daily challenges)
**Esfuerzo**: Alto (DB nueva + lógica de activación + tracking). **Valor**: Medio.

Una DB "Retos" con: nombre, días vigentes, recompensa, condición. Cron evalúa diariamente cuáles están activos. Widget aparte.

**Riesgo**: si los retos quedan ignorados, son ruido visual. Validar manualmente primero (sprint 2) antes de automatizar.

### Eventos especiales (períodos limitados)
**Esfuerzo**: Medio. **Valor**: Medio si los usás.

Inspirado en eventos de Dark Souls: "Festival de la Hoguera" = 1 semana doble XP en hábitos físicos. Requiere flag temporal en código y multiplicador en cálculo.

---

## 🔵 Sprint 4 — Cuando ya tengas hábito sólido (3+ meses)

### Jefes (Bosses)
Las misiones tipo `💀 Jefe Final` ya existen en el select. Crear ejemplos concretos:
- 💀 "Caballero del Hambre" — 30 días sin caer en Sin azúcar (Veces Target = 30, Épica, recompensa 500 XP + 1 humanidad)
- 💀 "Custodio del Sueño" — 60 días con Journaling diario
- 💀 "Maestro del Foco" — 100 días con Mente clara

**Esfuerzo**: Bajo (ya soportado). **Valor**: Alto si tu sistema está calibrado.

### Sistema de NPCs
Personajes que ofrecen misiones contextuales. Ej:
- 🧙 **El Anciano** — aparece cuando llegás a Nivel 5 y ofrece misión secreta
- ⚔️ **El Mercenario** — desafíos específicos de combate (físico)

**Esfuerzo**: Alto (DB nueva + narrativa + lógica de aparición). **Valor**: Bajo si es solo estética. Considerar después de 3 meses de uso si querés profundizar la inmersión narrativa.

### Prestige / New Game+
Al llegar a Nivel 12 (cuando exista), opción de "ascender":
- Reseteás XP a 0
- Empezás como `🌅 Renacido` (rango especial)
- Multiplicador permanente +25% XP en todos los hábitos

**Esfuerzo**: Medio. **Valor**: Bajo hoy. Solo importa cuando alguien llega al cap del sistema.

---

## ❌ Antipatterns a evitar

Decoración que NO agrega valor real:

- **Mascotas/companions** → ruido visual sin efecto en hábitos
- **Tienda con items cosméticos** → gasto de XP en vanidad, distrae del foco real
- **Achievements decorativos** sin mecánica → trofeos de participación
- **Chat con NPCs** → puro entertainment, no productividad
- **Animaciones complejas** en widgets → costo de mantenimiento alto, valor estético bajo
- **Multi-personaje en una misma cuenta** → fragmenta el tracking, dilución del foco

---

## Filosofía del backlog

**3 reglas para decidir si una idea entra al sprint actual:**

1. **¿Resuelve un problema real que hoy duele?** Sino, va al backlog.
2. **¿Lo voy a usar en los próximos 7 días?** Sino, es deuda futura.
3. **¿Cuesta más mantenerlo que el valor que aporta?** Sino, es deuda definitiva.

Aplicar este filtro a CADA idea que se te ocurra antes de implementarla. La mayoría no pasa el filtro — y eso está bien.

---

## Para futuras versiones del blueprint comercial

Las features de este backlog (especialmente Hogueras, Daily Challenges, Bosses, NPCs) son **diferenciadores de pricing tier**:

- **Tier Free**: sistema básico (5 DBs, 8 niveles, sin extras)
- **Tier Pro** ($29-49): + widgets + Hogueras + Veces Target
- **Tier Premium** ($99-199): + Daily Challenges + Bosses + NPCs + Prestige
- **Tier Coaching** ($300/mes): + diseño de misiones custom + calibración mensual

Esto da camino claro de upgrade pricing por valor incremental, no solo cantidad.
