# Fontana 🪙

> *Entrega tu moneda con fe. Un sistema de IA trabaja 30 días por tu deseo.*

Fontana es una plataforma de acompañamiento personal impulsada por inteligencia artificial.
El usuario registra un deseo, realiza una contribución simbólica a través de Wompi, y durante
30 días recibe correos personalizados generados por IA que trabajan sobre su intención.

**Sitio en producción:** [fontanadigital.dpdns.org](https://fontanadigital.dpdns.org)

---

## Estructura del repositorio

```
fontana/
├── automations/          → JSONs de flujos de correo (Paso A, B, C) + README
├── db/
│   └── schema.sql        → Schema completo de la base de datos Supabase
├── docs/
│   └── GUIA_MAESTRA_DESPLIEGUE.md  → Guía paso a paso de despliegue
├── legal/                → Documentos legales (.docx): términos, privacidad, reembolsos
├── marketing/
│   └── plan-de-marketing.md
├── produccion/
│   └── checklist_produccion_y_campana.md
├── supabase/
│   └── functions/
│       ├── _shared/
│       │   └── helpers.ts          → Utilidades compartidas (CORS, errores, guards)
│       ├── close-cycle/            → Cron: cierra ciclos de 30 días
│       ├── critical-monitor/       → Cron: monitoreo crítico each 15 min
│       ├── guardar-deseo/          → Persiste el deseo antes del pago
│       ├── guardar-identidad/      → Guarda nombre/edad/contexto (requiere JWT)
│       ├── monitor/                → Cron: health check completo horario
│       ├── notify-telegram/        → Envía notificaciones al bot de Telegram
│       ├── send-email/             → Envía correos via Resend
│       ├── telegram-bot/           → Comandos del bot de Telegram
│       ├── wompi-firma/            → Genera la firma de integridad para Wompi
│       └── wompi-webhook/          → Procesa confirmaciones de pago de Wompi
├── web/
│   ├── assets/
│   │   ├── img/
│   │   │   ├── favicon.svg
│   │   │   ├── apple-touch-icon.png
│   │   │   ├── og-image.png
│   │   │   └── fontana_ciclo_ia.png
│   │   └── js/
│   │       ├── fontana.js          → Lógica principal (modal, pago, auth)
│   │       ├── shared.js           → Header compartido y utilidades globales
│   │       └── ui.js               → Componentes de UI reutilizables
│   ├── css/
│   │   ├── fontana.css             → Estilos globales del sitio
│   │   └── theme-variables.css     → Variables CSS de tema (light/dark)
│   ├── favicon.ico                 → En raíz para compatibilidad con navegadores y bots
│   ├── index.html                  → Landing narrativa de scroll (PRODUCCIÓN)
│   ├── como-funciona.html
│   ├── roadmap.html
│   ├── identidad.html              → Formulario de perfil post-pago
│   ├── gracias.html
│   ├── contacto.html
│   ├── privacidad.html
│   ├── reembolsos.html
│   └── terminos.html
└── vercel.json                     → Configuración de Vercel (outputDirectory + rewrites)
```

---

## Cómo correr el proyecto localmente

El frontend es HTML/CSS/JS puro, sin proceso de build.

```bash
# Opción 1: Live Server de VS Code
# Instala la extensión "Live Server" y haz clic en "Go Live" en web/index.html

# Opción 2: npx serve
cd C:\Users\marce\Documents\fontana\web
npx serve .
# Abre http://localhost:3000

# Opción 3: Python
cd C:\Users\marce\Documents\fontana\web
python -m http.server 3000
```

> **Nota:** Para que funcione la autenticación con Google y las Edge Functions,
> necesitas apuntar a tu proyecto de Supabase real. Las URLs y claves están
> configuradas en `fontana.js` y `identidad.html`.

---

## Cómo deployar

### Frontend → Vercel

```bash
# Conecta el repo en vercel.com o usa la CLI
npm i -g vercel
vercel --prod
```

El `vercel.json` ya configura `outputDirectory: web` y los rewrites para
todas las rutas del sitio.

### Edge Functions → Supabase CLI

```bash
# Autenticarse y vincular al proyecto
supabase login
supabase link --project-ref TU_PROJECT_REF

# Configurar secrets (solo la primera vez)
supabase secrets set WOMPI_EVENTS_SECRET=...
supabase secrets set RESEND_API_KEY=...
supabase secrets set TELEGRAM_BOT_TOKEN=...
supabase secrets set TELEGRAM_CHAT_ID=...

# Deployar una función
supabase functions deploy guardar-deseo

# Deployar todas a la vez
supabase functions deploy
```

Ver la guía completa en `/docs/GUIA_MAESTRA_DESPLIEGUE.md`.

---

## Edge Functions — Qué hace cada una

| Función | Tipo | Descripción |
|---|---|---|
| `guardar-deseo` | Pública | Persiste el deseo + email antes de abrir el widget de Wompi |
| `guardar-identidad` | Privada (JWT) | Guarda nombre/edad/contexto del usuario. **Requiere JWT de sesión válida**. Solo puede modificar el wish del usuario autenticado |
| `wompi-firma` | Pública | Genera la firma de integridad (`integrity`) para el widget de Wompi |
| `wompi-webhook` | Pública (verificada) | Recibe confirmaciones de pago de Wompi. **Valida firma HMAC-SHA256** antes de procesar cualquier activación de deseo |
| `send-email` | Interna | Envía correos transaccionales vía Resend. Invocada por otras funciones |
| `notify-telegram` | Interna | Envía notificaciones al bot de Telegram del operador |
| `telegram-bot` | Pública (webhook) | Maneja comandos del bot: `/cola`, `/deseo`, `/stats`, `/enviado`, `/nota`, `/respuesta` |
| `close-cycle` | **Privada (service_role)** | Cron diario a las 9am (Colombia): cierra deseos vencidos, envía correo final, libera al usuario |
| `monitor` | **Privada (service_role)** | Health check completo de todos los servicios. Invocado por cron horario o manualmente |
| `critical-monitor` | **Privada (service_role)** | Monitoreo crítico de wompi-webhook + guardar-deseo + DB cada 15 min. Alerta y fija mensajes en Telegram si detecta fallos |

### Seguridad de las funciones privadas

Las funciones marcadas como **Privada (service_role)** rechazan cualquier
request que no incluya el `SUPABASE_SERVICE_ROLE_KEY` como Bearer token.
Nunca expongas esta clave en el cliente ni en el frontend.

---

## Variables de entorno requeridas

Todas las variables se configuran en Supabase (Project Settings > Edge Functions > Secrets):

| Variable | Usada en | Descripción |
|---|---|---|
| `SUPABASE_URL` | Todas | URL del proyecto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Todas | Clave de administrador (solo backend) |
| `SUPABASE_ANON_KEY` | `guardar-identidad` | Clave pública (para validar JWT de usuario) |
| `WOMPI_EVENTS_SECRET` | `wompi-webhook` | Secreto de eventos de Wompi para firmas HMAC |
| `RESEND_API_KEY` | `send-email` | API key de Resend para envío de correos |
| `TELEGRAM_BOT_TOKEN` | `notify-telegram`, `telegram-bot`, `monitor`, `critical-monitor` | Token del bot de Telegram |
| `TELEGRAM_CHAT_ID` | `notify-telegram`, `monitor`, `critical-monitor` | ID del chat/grupo de notificaciones |

---

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Frontend | HTML / CSS / JavaScript (vanilla) |
| Hosting | Vercel |
| Base de datos | Supabase (PostgreSQL) |
| Autenticación | Supabase Auth (Google OAuth) |
| Edge Functions | Deno (Supabase Edge Functions) |
| Pagos | Wompi |
| Correo | Resend |
| IA | GLM (Z.ai) |
| Notificaciones | Telegram Bot API |
| Cron | pg_cron (Supabase) |
