# Automatizaciones de Fontana — Guía de configuración (n8n)

Por qué n8n: es gratis si lo auto-hospedas (self-host), de código abierto,
y soporta exactamente este tipo de flujo (webhooks + IA + email + base de
datos). Si prefieres no instalar nada tú mismo, también puedes usar
**n8n Cloud** (tiene plan gratuito limitado) o **Make.com** (plan gratuito
con límite de operaciones/mes) — la lógica es la misma, solo cambia la
interfaz para construir el flujo.

## Las 3 automatizaciones

| Archivo | Qué hace | Disparador |
|---|---|---|
| `A_correo_paso1.json` | Activa el deseo y envía el correo inmediato con el "paso 1" | Webhook de Stripe (`checkout.session.completed`) |
| `B_ciclo_ia_seguimiento.json` | El ciclo de IA que revisa el historial, decide el siguiente paso y envía el correo — se repite hasta 4 veces, cada 7 días | Reloj cada hora (revisa qué deseos ya tocan) |
| `C_correo_final.json` | Resume las 4 semanas y envía el correo de cierre a los 30 días | Reloj cada 6 horas |

### Cómo funciona el "ciclo prompt sobre prompt" (Automatización B)

Esto es la pieza que pediste explícitamente, así que vale la pena
explicarla en detalle. Cada vez que le toca un seguimiento a un deseo:

1. **Se lee el historial completo** de lo que la IA ya decidió en ciclos
   anteriores (tabla `ai_cycle_log`).
2. **Primer prompt ("Planificar")**: la IA NO escribe el correo todavía.
   Solo analiza el deseo + todo lo ya sugerido, y decide cuál es el
   siguiente paso lógico — uno que construya sobre lo anterior, nunca que
   lo repita.
3. **Segundo prompt ("Redactar")**: con el paso ya decidido, un segundo
   llamado a la IA escribe el correo real, en el tono cálido de Fontana.
4. Esto se repite, ciclo tras ciclo, cada 7 días, hasta 4 veces (30 días),
   y cada ciclo "recuerda" todos los anteriores — por eso es un verdadero
   ciclo iterativo y no 4 correos genéricos desconectados.

## Paso 1 — Levantar tu instancia de n8n

**Opción gratuita recomendada (self-host en Railway/Render):**

1. Crea una cuenta en https://railway.app o https://render.com (ambos
   tienen capa gratuita/de muy bajo costo).
2. Despliega la imagen oficial de Docker `n8nio/n8n` — ambas plataformas
   tienen un botón de "Deploy from Docker image".
3. Define las variables de entorno mínimas:
   ```
   N8N_BASIC_AUTH_ACTIVE=true
   N8N_BASIC_AUTH_USER=tu_usuario
   N8N_BASIC_AUTH_PASSWORD=una_contraseña_fuerte
   N8N_HOST=tu-subdominio.railway.app
   WEBHOOK_URL=https://tu-subdominio.railway.app/
   ```
4. Una vez desplegado, entra a la URL pública — ahí está tu editor visual
   de n8n.

**Opción aún más simple (n8n Cloud):** ve a https://n8n.io/cloud, crea
cuenta, tienen prueba/plan gratuito limitado por ejecuciones al mes.
Para el volumen de un emprendimiento que recién empieza, alcanza.

## Paso 2 — Importar los 3 workflows

En el editor de n8n: **Workflows > Import from File** y selecciona cada
uno de los 3 archivos `.json` de esta carpeta, uno por uno.

## Paso 3 — Configurar las credenciales (una sola vez, se reutilizan)

### Credencial de Supabase
1. En n8n: Credentials > New > Supabase API
2. Host: la URL de tu proyecto (`https://xxxx.supabase.co`)
3. Service Role Key: **usa la `service_role` key, NO la `anon` key** —
   la encuentras en Supabase Dashboard > Project Settings > API. La
   service_role key ignora las políticas RLS, que es lo que necesita la
   automatización para leer/escribir cualquier deseo.
4. ⚠️ Nunca pongas la service_role key en el frontend de tu web — solo
   vive dentro de n8n.

### Credencial de GLM (Z.ai)
1. Crea cuenta en https://open.bigmodel.cn (o z.ai, según la región)
2. Genera tu API key en el panel de desarrollador.
3. En n8n: Credentials > New > Header Auth
   - Name: `Authorization`
   - Value: `Bearer TU_API_KEY_AQUI`
4. Asigna esta credencial a los 5 nodos HTTP Request que llaman a GLM en
   los 3 workflows (búscalos por el nombre "GLM - ...").

### Credencial de Resend (envío de correo)
1. Crea cuenta gratuita en https://resend.com (su plan free incluye
   3,000 correos/mes, suficiente para empezar).
2. Verifica tu dominio (`fontana.wish` o el que elijas) siguiendo sus
   instrucciones de registros DNS — esto es necesario para que tus
   correos no caigan en spam.
3. Genera tu API key y créala como credencial en n8n (Header Auth con
   `Authorization: Bearer re_xxxx`), o instala el nodo nativo de Resend
   si tu versión de n8n lo incluye.

## Paso 4 — Activar los workflows

Cada workflow tiene un switch "Active" arriba a la derecha en n8n.
Actívalos los 3. El workflow A solo corre cuando Stripe le manda un
webhook; B y C corren solos por reloj.

## Paso 5 — Probar de punta a punta ANTES de lanzar

1. Inserta un deseo de prueba manualmente en Supabase con tu propio
   correo, `status='pending_payment'`.
2. Simula el webhook de Stripe (puedes usar la Stripe CLI:
   `stripe trigger checkout.session.completed`, o el botón "Send test
   webhook" del dashboard de Stripe) apuntando a tu URL de n8n.
3. Confirma que: (a) el deseo pasa a `active` en Supabase, (b) llega el
   correo de paso 1 a tu bandeja.
4. Para probar el ciclo de seguimiento sin esperar 7 días reales, edita
   manualmente `next_followup_at` en Supabase a una fecha en el pasado,
   y espera a que corra el reloj de la hora (o ejecuta el workflow B
   manualmente con el botón "Execute Workflow" en n8n).
5. Repite hasta ver los 4 seguimientos y el correo final.

## Costos estimados (mensual, para empezar)

| Servicio | Costo |
|---|---|
| n8n self-host en Railway | ~$0-5 USD/mes (capa gratuita o casi) |
| Supabase | Gratis hasta 500MB de base de datos y 50,000 usuarios |
| Resend | Gratis hasta 3,000 correos/mes |
| GLM (Z.ai) | Pago por uso — revisa precios actuales en open.bigmodel.cn, suele ser muy bajo costo por cada llamado |
| Stripe | Sin mensualidad, ~2.9%+$0.30 por transacción exitosa |

Con este stack, el costo fijo mensual para empezar puede ser cercano a
$0-10 USD, escalando solo con el uso real (correos e IA), que es
exactamente lo que pediste.
