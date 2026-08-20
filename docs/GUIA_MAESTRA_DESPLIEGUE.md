# Fontana — Guía Maestra de Despliegue

Esta es la hoja de ruta completa, en orden. Sigue los pasos en secuencia;
cada uno depende del anterior.

> **Última revisión:** Agosto 2026. El stack de pagos se migró de Stripe a **Wompi**
> (pasarela colombiana). La guía de Stripe ha sido eliminada del repositorio.

## Resumen de lo que vas a desplegar

```
Usuario → Landing (Vercel) → Login Google (Supabase Auth)
        → Formulario de deseo → Pago (Wompi widget)
        → wompi-webhook confirma pago → send-email: correo "paso 1"
        → Automatización B (seguimientos c/ 7 días x4)
        → close-cycle: correo final a los 30 días
```

Todo el dato vive en **Supabase** (base de datos + autenticación + Edge Functions).
El frontend estático se sirve desde **Vercel**.

---

## PASO 0 — Decisiones previas

- [ ] Dominio: actualmente configurado en `fontanadigital.dpdns.org`.
      Para producción real, compra un dominio en Namecheap o Cloudflare Registry (~$10-15 USD/año).
- [ ] Define la entidad legal para recibir pagos con Wompi (persona natural o empresa).
- [ ] Define tu correo de soporte real (ej. `hola@fontana.digital`).
- [ ] **Antes de cobrar**: lleva los 3 documentos legales (`/legal/*.docx`) a revisión
      de un abogado de tu país (las reglas de protección al consumidor varían entre países).

## PASO 1 — Base de datos (Supabase)

1. Crea cuenta gratuita en https://supabase.com
2. New Project → elige nombre, contraseña de base de datos (guárdala),
   región más cercana a tu audiencia principal.
3. Ve a **SQL Editor** → New query → pega el contenido completo de
   `/db/schema.sql` → Run.
4. Ve a **Authentication > Providers** → activa **Google**:
   - Necesitas crear credenciales OAuth en
     https://console.cloud.google.com/apis/credentials
   - Tipo: "OAuth client ID" → "Web application"
   - Authorized redirect URI: la que Supabase te muestra en esa misma
     pantalla (algo como `https://xxxx.supabase.co/auth/v1/callback`)
   - Copia el Client ID y Client Secret de Google a la pantalla de
     Supabase y guarda.
5. Guarda en un lugar seguro (NUNCA en el código):
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY` (para el frontend — puede estar en código cliente)
   - `SUPABASE_SERVICE_ROLE_KEY` (NUNCA en el cliente, solo en Edge Functions)

## PASO 2 — Edge Functions (Supabase CLI)

```bash
# Instalar la CLI de Supabase (una sola vez)
npm install -g supabase

# Autenticarse
supabase login

# Vincular al proyecto
supabase link --project-ref TU_PROJECT_REF

# Configurar secrets (los que cada función necesita)
supabase secrets set WOMPI_EVENTS_SECRET=tu_secreto_wompi
supabase secrets set RESEND_API_KEY=tu_api_key_resend
supabase secrets set TELEGRAM_BOT_TOKEN=tu_bot_token
supabase secrets set TELEGRAM_CHAT_ID=tu_chat_id

# Desplegar todas las funciones
supabase functions deploy guardar-deseo
supabase functions deploy guardar-identidad
supabase functions deploy wompi-firma
supabase functions deploy wompi-webhook
supabase functions deploy send-email
supabase functions deploy notify-telegram
supabase functions deploy telegram-bot
supabase functions deploy monitor
supabase functions deploy critical-monitor
supabase functions deploy close-cycle
```

### Funciones privadas (solo acceso con service_role key)

Las siguientes funciones **rechazan** cualquier llamada que no incluya la
`SUPABASE_SERVICE_ROLE_KEY` como Bearer token. Nunca las invoques desde el cliente:

- `close-cycle` — cierra ciclos de 30 días (invocada por pg_cron)
- `monitor` — health check completo (invocado por pg_cron u operador)
- `critical-monitor` — monitoreo crítico each 15 min (invocado por pg_cron)

## PASO 3 — Pasarela de pago (Wompi)

1. Crea cuenta en https://wompi.co
2. En Panel > Desarrolladores copia:
   - **Llave pública** (empieza con `pub_`) → va en el widget del frontend
   - **Secreto de eventos** → `WOMPI_EVENTS_SECRET` en Supabase secrets
3. En Panel > Configuración > Webhooks, configura la URL de evento:
   `https://TU_PROJECT.supabase.co/functions/v1/wompi-webhook`
4. La función `wompi-webhook` ya valida la firma HMAC-SHA256 de Wompi.
   **Nunca actives un deseo solo por la respuesta del frontend** — esto
   se puede falsificar. Solo el webhook de Wompi es confiable.

## PASO 4 — Automatizaciones (cron en Supabase)

Ejecutar en el **SQL Editor** de Supabase para configurar pg_cron:

```sql
-- Activar extensión de cron (una sola vez)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Cierre de ciclos a las 9am Colombia (14:00 UTC)
SELECT cron.schedule(
  'fontana-close-cycle',
  '0 14 * * *',
  $$
  SELECT net.http_post(
    url := 'https://TU_PROJECT.supabase.co/functions/v1/close-cycle',
    headers := json_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer TU_SERVICE_ROLE_KEY'
    )::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- Monitor horario
SELECT cron.schedule(
  'fontana-monitor-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://TU_PROJECT.supabase.co/functions/v1/monitor',
    headers := json_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer TU_SERVICE_ROLE_KEY'
    )::jsonb,
    body := '{"silent": true}'::jsonb
  );
  $$
);

-- Critical monitor each 15 min
SELECT cron.schedule(
  'fontana-critical-monitor',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://TU_PROJECT.supabase.co/functions/v1/critical-monitor',
    headers := json_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer TU_SERVICE_ROLE_KEY'
    )::jsonb,
    body := '{}'::jsonb
  );
  $$
);
```

## PASO 5 — Desplegar el frontend (Vercel)

1. Crea cuenta en https://vercel.com.
2. Conecta el repositorio de GitHub.
3. En la configuración del proyecto de Vercel:
   - **Output Directory**: `web` (ya está en `vercel.json`)
4. El archivo `vercel.json` en la raíz ya tiene los rewrites para todas
   las rutas del sitio. No es necesaria configuración adicional.
5. Conecta tu dominio desde el panel de Vercel (Domains > Add domain).

## PASO 6 — Pruebas finales antes de anunciar

- [ ] Crear usuario de prueba con tu propio Google.
- [ ] Verificar que un segundo deseo con la misma cuenta está bloqueado
      (tanto en UI como en base de datos — el índice único de `schema.sql`
      ya lo garantiza a nivel de datos).
- [ ] Hacer un pago real de prueba (mínimo permitido por Wompi) y confirmar
      que llega el correo de "paso 1" en menos de 2 minutos.
- [ ] Completar el formulario de identidad en `/identidad` con un wishId
      real y verificar que la función valida el JWT correctamente.
- [ ] Forzar el vencimiento de un ciclo editando `cycle_due_at` en
      Supabase y ejecutar `close-cycle` manualmente.

## PASO 7 — Lanzamiento

Sigue `/marketing/plan-de-marketing.md` para la secuencia de canales y
el copy ya redactado.

---

## Resumen de costos mensuales para empezar

| Pieza | Costo |
|---|---|
| Dominio | ~$1/mes (pagado anual) |
| Supabase | $0 (capa gratuita) |
| Resend | $0 (hasta 3,000 correos/mes) |
| Vercel | $0 |
| Wompi | $0 fijo + % por transacción exitosa |
| GLM (Z.ai) | Variable según uso, costo bajo por llamada |

**Total fijo estimado: $1-2 USD/mes**, escalando solo con uso real.

## Mejoras recomendadas (no bloqueantes para el MVP)

1. **Moderación del texto del deseo antes de que entre a la IA**: agrega
   un primer prompt de clasificación que detecte contenido de riesgo
   (autolesión, violencia, salud grave) y en esos casos, en vez de un
   correo motivacional genérico, el correo debe reconocer la situación
   con cuidado y sugerir recursos de ayuda profesional apropiados.
2. **Página de estado del deseo** (dashboard simple donde el usuario
   logueado vea sus correos recibidos y el progreso).
3. **Límite de longitud y detección de idioma** — el formulario ya limita
   a 600 caracteres, pero considera detectar el idioma del texto para
   responder en el idioma del usuario si vas a mercados no hispanohablantes.
4. **Doble verificación de "una persona, un deseo"**: el login de Google
   ayuda mucho, pero alguien decidido puede crear una segunda cuenta de
   Gmail. La siguiente capa de bajo costo es bloquear por huella de
   dispositivo (FingerprintJS open-source).
