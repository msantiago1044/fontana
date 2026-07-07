# Fontana — Checklist de Preparación para Producción + Primera Campaña

Este documento une todo lo que necesitas tener listo, organizado en 3
pistas que avanzan EN PARALELO (no en fila), porque algunas cosas
(aprobación de Stripe, verificación de dominio en Resend) tardan días
y no debes esperar a que termine una pista para empezar la siguiente.

---

## PISTA A — Backend técnico (esto desbloquea que el producto funcione de verdad)

- [ ] Crear proyecto Supabase + correr `schema.sql`
- [ ] Activar Google OAuth (Supabase + Google Cloud Console)
- [ ] Comprar dominio definitivo (si no lo tienes) — lo necesitas para
      el paso de Resend de abajo, así que hazlo temprano
- [ ] Cuenta Resend + verificar dominio (la verificación DNS puede
      tardar de minutos a un día — hazlo cuanto antes)
- [ ] Cuenta GLM (Z.ai) + API key
- [ ] n8n desplegado en Railway/Render + importar los 3 workflows
- [ ] Conectar el frontend real (quitar los mocks: login real, llamada
      real a Stripe Checkout)
- [ ] Probar el flujo completo de punta a punta CONTIGO MISMO al menos
      3 veces, con $1 real cada vez, antes de pensar en tráfico externo

**Esta pista es la que seguimos la próxima vez que retomemos — ya
tienes todos los archivos (schema.sql, los 3 JSON de n8n, la guía de
Stripe). Cuando quieras, la reanudamos paso a paso.**

---

## PISTA B — Aprobación de Stripe en modo Live

- [ ] Completar verificación de identidad (KYC) en Stripe
- [ ] Agregar datos bancarios para los payouts
- [ ] En la descripción del negocio, usar el encuadre ya validado:
      *"Servicio digital de coaching personal y contenido motivacional
      generado por inteligencia artificial"*
- [ ] Esperar aprobación (puede ser instantánea o tardar 1-3 días
      hábiles si entra a revisión manual — esto es normal, no significa
      que algo esté mal)
- [ ] Solo después de aprobado: cambiar las llaves de `sk_test_` a
      `sk_live_` y crear el webhook de producción

---

## PISTA C — Legal + cuenta publicitaria (en paralelo, no esperan a A ni B)

- [ ] Revisión rápida de los 3 documentos legales por un abogado local
      (sobre todo por el alcance internacional)
- [ ] Crear cuenta de TikTok Ads Manager (ver guía abajo)
- [ ] Crear cuenta de TikTok orgánica (@fontana o similar) para subir
      el video también de forma gratuita antes/junto con la campaña
      pagada — el video con buen desempeño orgánico se puede "potenciar"
      después con presupuesto

---

# Por qué TikTok y no Meta para esta primera prueba

Con $5-10 USD/día, TikTok da más alcance por dólar a cuentas nuevas, y
el formato (video corto, vertical, con voz en off) es exactamente lo
que tu producto necesita mostrar: el ritual visual de la moneda y la
fuente. Meta funciona mejor con presupuestos más altos y formatos de
imagen + copy largo, que no es la fortaleza de Fontana.

## Lo que TikTok exige y que debes cumplir desde el primer video

1. **No prometer ni exagerar resultados.** El anuncio y la landing page
   no pueden decir ni insinuar "tu deseo se cumplirá". Esto no es
   opcional — es causa automática de rechazo.
2. **Etiqueta de contenido generado por IA.** Como tu video va a ser
   editado/generado con herramientas de IA (voz, posiblemente clips),
   TikTok pide activar la opción "Disclose commercial content" → marcar
   que el contenido usa IA generativa de forma significativa, al subir
   el video (aparece como opción al publicar, antes de promoverlo como
   anuncio).
3. **Restricción geográfica por país.** Horóscopo/fortune-telling está
   permitido con condiciones en países como Colombia, México, España,
   Estados Unidos, y la mayoría de Latinoamérica, pero está prohibido
   en otros (Argentina, Ecuador y varios países de Medio Oriente/Norte
   de África, entre otros). **Para esta primera prueba, limita el
   targeting geográfico a 3-5 países donde sí está permitido**, en vez
   de lanzar "mundial". Esto reduce el riesgo de rechazo automático.
4. **Sin figuras públicas reales** en el video ni en testimonios
   inventados atribuidos a personas reales.

## Países sugeridos para el targeting inicial (basado en la política vigente)

Colombia, México, España, Estados Unidos, Chile — todos con
fortune-telling/horóscopo permitido bajo condiciones, y todos
hispanohablantes o con buena base hispana, lo cual aprovecha el copy
que ya tienes en español.

---

# Guion de video ajustado para cumplir la política de TikTok

Esta es una versión ajustada del guion que ya teníamos, revisada
específicamente para que cada línea sea defendible ante la política
de "no prometer resultados":

```
[Escena 1 — 0:00-0:04]
Visual: moneda cayendo en agua oscura, cámara lenta, fondo dorado/negro.
Texto en pantalla: "Todos hemos lanzado una moneda a una fuente alguna vez"
Voz IA: misma línea, tono cálido y pausado.

[Escena 2 — 0:04-0:10]
Visual: captura de pantalla del formulario de deseo en el sitio.
Texto en pantalla: "Esta vez, algo se queda trabajando después de que te vas"
Voz IA: misma línea.

[Escena 3 — 0:10-0:17]
Visual: mockup de un correo llegando ("Tu deseo ya está en marcha").
Texto en pantalla: "Una IA revisa tu deseo y te escribe con el siguiente paso"
Voz IA: "Un sistema de inteligencia artificial trabaja en tu deseo durante
30 días, y te escribe en el momento justo para avanzar."

[Escena 4 — 0:17-0:24]
Visual: logo Fontana, fondo nocturno con ondas doradas animadas.
Texto en pantalla: "Fontana — Fe y trabajo. Desde 1 dólar."
Voz IA: "Fontana. Fe y trabajo. Desde un dólar."

[Escena 5 — 0:24-0:28, cierre obligatorio de transparencia]
Texto en pantalla (letra pequeña, legible): "No prometemos que tu deseo
se cumplirá. Prometemos que no se queda solo."
Sin voz, solo texto — funciona como tu propio disclaimer visual, y
refuerza la marca de honestidad en vez de restarle fuerza.
```

**Por qué la escena 5 no es opcional**: en vez de que TikTok (o un
usuario) interprete el video como una promesa, tú mismo te adelantas y
lo aclaras. Esto es lo mismo que hace el sitio web, y es lo que te
protege de que la cuenta publicitaria entera sea suspendida.

---

# Copy del anuncio (texto que acompaña al video en TikTok Ads)

```
🪙 La fuente que no descansa.
Pide tu deseo. Una IA trabaja en él 24/7, durante 30 días.
No prometemos magia — prometemos que no estarás solo en el camino.
Desde $1 USD.
```

CTA del botón: **"Más información"** o **"Probar"** (evita usar un CTA
tipo "Comprar ahora" que suene transaccional puro — no calza con el
tono del producto).

---

# Configuración sugerida de la primera campaña en TikTok Ads Manager

| Configuración | Valor sugerido |
|---|---|
| Objetivo de campaña | Tráfico (Traffic) — no Conversiones todavía, hasta tener suficiente data de píxel |
| Presupuesto | $7 USD/día (dentro de tu rango de $5-10) |
| Duración inicial | 5-7 días, sin cambios, antes de evaluar |
| Edades | 22-45 |
| Países | Colombia, México, España, Estados Unidos, Chile |
| Idioma del anuncio | Español |
| Ubicación del anuncio | Solo TikTok (no Pangle/red de socios, para la primera prueba) |
| Píxel de TikTok | Instalarlo en la landing ANTES de lanzar la campaña (ver sección siguiente) |

## Instalar el píxel de TikTok en tu landing

1. En TikTok Ads Manager → Assets → Events → "Web" → crea un píxel.
2. Te da un snippet de código para pegar antes de `</head>` en tu
   `index.html`.
3. Esto te permite medir cuántas visitas realmente abren el modal de
   "Pedir mi deseo" y cuántas completan el pago — información clave
   para decidir si vale la pena subir el presupuesto después.

---

# Qué métricas vigilar la primera semana

| Métrica | Qué te dice |
|---|---|
| CPC (costo por clic) | Si es muy alto desde el día 1, el público o el video no están conectando |
| CTR (click-through rate) | Por debajo de ~1% en TikTok suele indicar que el video no engancha en los primeros 2 segundos |
| Tasa de clic → deseo iniciado | Mide si la landing convence una vez que llegan |
| Tasa de deseo iniciado → pago completado | Mide si el monto/flujo de pago genera fricción |
| Reportes o rechazos de la cuenta publicitaria | Señal inmediata de que algo en el copy/video viola política — ajusta y vuelve a subir, no ignores el aviso |

---

# Orden recomendado de los próximos pasos concretos

1. Retomamos PISTA A (Supabase) — esto no depende de nada más.
2. En paralelo, tú abres la cuenta de Stripe y empiezas la verificación
   (PISTA B) — eso corre solo, sin que yo intervenga.
3. En paralelo, empiezas a producir el video con un editor de IA
   (CapCut, que tiene voces IA integradas y es gratis, es el más usado
   para este tipo de contenido en TikTok) usando el guion de arriba.
4. Cuando A y B estén listas, conectamos todo y hacemos las pruebas
   reales de pago.
5. Solo entonces subimos el video (orgánico primero, luego como
   anuncio) y activamos la campaña.
