# Reglas de Proyecto y Arquitectura de Fontana (AGENTS.md)
<!-- gentle-ai:project-rules -->

Este documento rige la arquitectura, políticas de privacidad, flujo autónomo y contratos de paridad de **Fontana**. Aplica a cualquier agente, subagente o sesión futura en este repositorio.

---

## 1. Contrato de Paridad Absoluta (Mission Control ↔ Telegram Bot)

El panel administrativo web (`web/admin.html` desplegado en `/admin`) y el bot de supervisión de Telegram (`supabase/functions/telegram-bot`) deben mantener **paridad funcional total**. Toda acción operativa disponible en uno debe estar disponible en el otro:

1. **Aprobación de Plan Maestro (HITL):**
   - Tanto desde Telegram (`/aprobar [ID]` o botón `[ ✅ Aprobar Plan ]`) como desde Mission Control (botón en la pestaña *📋 Plan Maestro*).
   - Actualiza `wishes.plan_status = 'approved'` y registra `plan_approved_at`.
   - Notifica inmediatamente al otro canal sobre la aprobación para sincronización bilateral.

2. **Aprobación y Despacho de Reportes Semanales (HITL):**
   - Al completarse los días 7, 14, 21 y 28, el motor genera un borrador en `wishes.internal_notes` y espera aprobación humana.
   - Puede ser aprobado desde Telegram (`[ ✅ Aprobar y Enviar ]`) o desde Mission Control (botón `[ 🚀 Aprobar y Despachar Correo al Cliente ]` en la pestaña *✉️ Correos y Borradores*).
   - Despacha mediante la Edge Function `send-email` (`type: "manual_reply"`), registra en `email_log` y limpia el borrador pendiente.

3. **Respuestas y Mensajes Manuales al Cliente:**
   - Telegram permite responder con el comando `/responder [ID]`.
   - Mission Control permite redactar y enviar respuestas personalizadas desde el formulario desplegable de la pestaña *✉️ Correos y Borradores*.

4. **Auditoría de Percepción y Feedback:**
   - La retroalimentación 1-clic enviada en los correos semanales se almacena en `wishes.client_feedback`.
   - Debe ser visible y auditable tanto en Mission Control (pestaña *💬 Feedback*) como en las consultas de Telegram.

---

## 2. Regla Sagrada de Privacidad del Cliente

- **PROHIBICIÓN ESTRICTA:** Bajo ninguna circunstancia se debe mostrar o mencionar al cliente (en correos, interfaz de usuario o respuestas públicas):
  - Conteo de tokens (prompt, completion o totales).
  - Milisegundos o minutos de cómputo o inferencia de IA.
  - Costos financieros en USD o COP asociados a la infraestructura de IA.
  - Términos como "modelo LLM", "prompt", "tokens de cómputo".
- **USO EXCLUSIVO:** Dichas métricas son de uso exclusivo y privado para el operador humano dentro de **Mission Control** (`/admin`) y las alertas de **Telegram Control**.
- **TONO AL CLIENTE:** Elegante, ejecutivo, empático y solemne. La voz de la organización es **La Fuente — Fontana**.

---

## 3. Ciclo Autónomo de 30 Días y Handoffs

- Cada deseo activo tiene un ciclo de 30 días calendario y sesiones autónomas registradas en la tabla `public.ai_daily_work`.
- **Handoff Encadenado:** Cada sesión diaria toma como contexto previo el campo `tomorrow_handoff` de la sesión del día anterior (`day_number - 1`).
- **Pausa HITL Semanal:** Al registrarse el Día 7, 14, 21 o 28, el motor detiene la ejecución automática y formula el borrador ejecutivo del reporte semanal. No continúa al día siguiente hasta que el operador humano aprueba el correo.
- **Enlaces 1-Clic de Feedback:** Cada reporte semanal lleva 3 enlaces únicos a `https://fontana.digital/feedback.html` con parámetros `?wish=<UUID>&week=<N>&rating=<positive|neutral|negative>`. Al hacer clic, una RPC de Supabase (`submit_client_feedback`) guarda la calificación directamente en el JSONB del deseo.

---

## 4. Dominios y Topología Productiva

- **Dominio Principal (Producción):** `https://fontana.digital` (desplegado vía Vercel conectado a la rama `main`).
- **Dominio Secundario / Webhook:** `https://fontanadigital.dpdns.org`.
- **Panel Administrativo:** `/admin` (`web/admin.html`).
- **Receptor de Feedback:** `/feedback` (`web/feedback.html`).
- **Backend / Database:** Supabase Cloud `cbvqwdrbwogsmcglsvzg` (`sa-east-1`).
- **Motor Autónomo:** `fontana_engine.py` (soporta CLI `plan`, `daily`, `approve`, `balance`, `daemon`, `simulate-week`, `send-email`).
- **Modelo de IA Activo:** `gemini-3.1-flash-lite` (vía Google Gemini API).

---

## 5. Subagentes y División de Tareas

Cuando una solicitud involucre cambios complejos en múltiples capas:
- **Subagente Frontend:** Encargado de `web/admin.html`, vistas, estilos CSS Fontana (temas Light, Blue, Dark), JavaScript y componentes interactivos.
- **Subagente Backend & Engine:** Encargado de `fontana_engine.py`, base de datos Supabase, tablas (`wishes`, `ai_daily_work`, `email_log`) y Edge Functions (`telegram-bot`, `send-email`, `notify-telegram`).
- **Subagente Verificador:** Encargado de validar la paridad de acciones, pruebas de extremo a extremo y verificar que no se rompan las reglas de privacidad.

---

## 6. Naturaleza 100% Digital y Doble Capa del Motor

- **100% Digital y Flexible:** Fontana nunca promete acciones físicas ni simula métricas externas. Los planes de 30 días se diseñan a la medida de cada deseo y categoría (sin moldes rígidos por semana).
- **Capa 1 — Equipamiento al Usuario (Correos Semanales):** Fontana entrega conocimiento curado, herramientas/apps digitales recomendadas, enlaces seguros de búsqueda de tutoriales en YouTube (`https://www.youtube.com/results?search_query=...`, nunca inventar URLs directas), guías, plantillas, guiones y prompts.
- **Capa 2 — Resultado Interno para la Red:** En cada sesión diaria (`ai_daily_work.daily_result`), bajo el bloque `🌐 [RESULTADO INTERNO FONTANA — INFORMACIÓN PARA LA RED]:`, el motor redacta y almacena una pieza de información útil e indexable sobre el tema del deseo para futura publicación automática en internet. Este bloque interno no se envía en el correo al cliente.
