# Fontana — Guía Maestra de Despliegue

Esta es la hoja de ruta completa, en orden. Sigue los pasos en secuencia;
cada uno depende del anterior.

## Resumen de lo que vas a desplegar

```
Usuario → Landing (Vercel/Netlify) → Login Google (Supabase Auth)
        → Formulario de deseo → Pago (Stripe Checkout)
        → Webhook confirma pago → Automatización A (n8n + GLM): correo "paso 1"
        → Automatización B (n8n + GLM): ciclo cada 7 días x4, con memoria propia
        → Automatización C (n8n + GLM): correo final a los 30 días
```

Todo el dato vive en **Supabase** (base de datos + autenticación).
Todo el "cerebro" vive en **n8n** (orquestación) + **GLM** (la IA que
piensa y redacta).

---

## PASO 0 — Decisiones que necesitas tomar antes de empezar

- [ ] Nombre de dominio: sugerido `fontana.wish`, `getfontana.com`, o
      similar. Compra en Namecheap, Google Domains, o tu registrador
      preferido (~$10-15 USD/año).
- [ ] Define la entidad legal que va a recibir los pagos (persona
      natural o empresa) — esto lo necesitas para Stripe.
- [ ] Define tu correo de soporte real (ej. `hola@fontana.wish`).
- [ ] **Antes de cobrar un solo dólar**: lleva los 3 documentos legales
      (`/legal/*.docx`) a revisión de un abogado de tu país, sobre todo
      por el alcance "global" que mencionaste — las reglas de protección
      al consumidor varían mucho entre países, y un abogado puede
      decirte si necesitas ajustar algo para tu jurisdicción base.

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
5. Guarda en un lugar seguro (no en el código):
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY` (para el frontend)
   - `SUPABASE_SERVICE_ROLE_KEY` (solo para n8n, nunca para el frontend)

## PASO 2 — Conectar el login real en la landing page

El archivo `/web/index.html` que te entregué tiene un botón de Google
funcional en apariencia, pero con un `mockGoogleLogin()` de marcador de
posición. Para conectarlo de verdad necesitas el SDK de Supabase:

1. Agrega antes de `</head>` en `index.html`:
   ```html
   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
   ```
2. Reemplaza la función `mockGoogleLogin()` por:
   ```javascript
   const supabase = window.supabase.createClient(
     'TU_SUPABASE_URL',
     'TU_SUPABASE_ANON_KEY'
   );

   async function mockGoogleLogin(){
     const { error } = await supabase.auth.signInWithOAuth({
       provider: 'google',
       options: { redirectTo: window.location.href }
     });
     if(error) alert('No pudimos iniciar sesión: ' + error.message);
   }

   // Al cargar la página, revisa si ya hay sesión activa
   supabase.auth.getSession().then(({ data }) => {
     if (data.session) {
       // Usuario ya autenticado: puedes saltar directo al paso del deseo
       // y rellenar el correo automáticamente con data.session.user.email
     }
   });
   ```
3. Antes de mostrar el formulario de deseo, consulta si el usuario ya
   tiene un deseo activo (`profiles.has_active_wish`) y si es `true`,
   muestra un mensaje en vez del formulario: *"Ya tienes un deseo activo
   en la Fuente. Revisa tu correo para ver tu progreso."*

## PASO 3 — Pasarela de pago (Stripe)

Sigue el documento completo `/docs/stripe-setup.md`. Resumen de hitos:
1. Cuenta Stripe + producto con precio variable desde $1.
2. Endpoint backend que crea la Checkout Session (necesitas un lugar
   donde correr ese código — puede ser una Supabase Edge Function,
   ver Paso 3.1 abajo).
3. Webhook apuntando a tu n8n.
4. Probar todo en modo Test antes de activar modo Live.

### Paso 3.1 — Dónde corre el código del backend (gratis)

Como no quieres costos de servidor, usa **Supabase Edge Functions**
(corren gratis hasta 500,000 invocaciones/mes):

```bash
# En tu computadora, con la CLI de Supabase instalada:
supabase functions new crear-pago
# Pega el código de crear-sesion-pago.js (adaptado a Deno) en
# supabase/functions/crear-pago/index.ts
supabase functions deploy crear-pago
```

Esto te da una URL pública tipo
`https://xxxx.supabase.co/functions/v1/crear-pago` que llamas desde el
botón "Ir a pagar" del modal en la landing.

## PASO 4 — Automatizaciones (n8n + GLM + Resend)

Sigue el documento completo `/automations/README.md`. Resumen de hitos:
1. Despliega n8n (Railway/Render, capa gratuita).
2. Importa los 3 workflows JSON.
3. Configura credenciales: Supabase (service role), GLM (API key),
   Resend (API key + dominio verificado).
4. Activa los 3 workflows.
5. Prueba de punta a punta con un deseo de prueba.

## PASO 5 — Desplegar la landing page (gratis)

1. Crea cuenta en https://vercel.com o https://netlify.com (ambos
   gratis para sitios estáticos).
2. Sube la carpeta `/web` completa (arrastra y suelta en Netlify, o
   conecta un repositorio de GitHub en Vercel).
3. Conecta tu dominio comprado en el Paso 0 desde el panel de
   Vercel/Netlify (Domains > Add domain), siguiendo sus instrucciones
   de registros DNS.
4. Verifica que `terminos.html`, `privacidad.html` y `reembolsos.html`
   carguen correctamente desde los links del footer.

## PASO 6 — Pruebas finales antes de anunciar

- [ ] Crear un usuario de prueba real con tu propio Google.
- [ ] Confirmar que no puedes crear un segundo deseo con la misma cuenta
      (la regla de "1 deseo por persona" debe bloquear esto en la UI Y
      en la base de datos — el índice único de `schema.sql` ya lo hace
      a nivel de datos).
- [ ] Pagar $1 real (modo Live) tú mismo y confirmar que llega el correo
      de "paso 1" en menos de 2 minutos.
- [ ] Forzar manualmente (cambiando fechas en Supabase) el primer
      seguimiento de 7 días y confirmar que el correo llega y que el
      contenido tiene sentido como continuación del primero.
- [ ] Solicitar tu propio reembolso dentro de la ventana de 48h y
      confirmar que el proceso (manual, por ahora) funciona.

## PASO 7 — Lanzamiento

Sigue `/marketing/plan-de-marketing.md` para la secuencia de canales y
el copy ya redactado.

---

## Resumen de costos mensuales para empezar

| Pieza | Costo |
|---|---|
| Dominio | ~$1/mes (pagado anual) |
| Supabase | $0 (capa gratuita) |
| n8n en Railway | ~$0-5/mes |
| Resend | $0 (hasta 3,000 correos/mes) |
| Vercel/Netlify | $0 |
| Stripe | $0 fijo + ~2.9%+$0.30 por transacción |
| GLM (Z.ai) | Variable según uso, costo bajo por llamada |

**Total fijo estimado: $1-6 USD/mes**, escalando solo con uso real.

## Mejoras que recomiendo considerar (no bloqueantes para el MVP)

1. **Moderación del texto del deseo antes de que entre a la IA**: agrega
   un primer prompt de clasificación que detecte contenido de riesgo
   (autolesión, violencia, salud grave) y en esos casos, en vez de un
   correo motivacional genérico, el correo debe reconocer la situación
   con cuidado y sugerir recursos de ayuda profesional apropiados —
   nunca tratar esos deseos igual que "quiero un mejor trabajo".
2. **Página de estado del deseo** (un dashboard simple donde el usuario
   logueado vea sus correos recibidos y el progreso) — mejora mucho la
   percepción de seriedad del servicio, aunque no es necesaria para el
   lanzamiento inicial.
3. **Límite de longitud y idioma del deseo** ya está cubierto (600
   caracteres en el formulario), pero considera detectar el idioma del
   texto y responder en ese idioma si vas a anunciar en mercados no
   hispanohablantes, dado tu objetivo de alcance global.
4. **Doble verificación de "una persona, un deseo"**: el login de Google
   ayuda mucho, pero alguien decidido puede crear una segunda cuenta de
   Gmail. Si esto se vuelve un problema real de abuso, la siguiente capa
   de defensa de bajo costo es bloquear por huella de dispositivo
   (librería gratuita como FingerprintJS open-source) antes de saltar a
   verificación por SMS, que ya tiene costo por mensaje.
