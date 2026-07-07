# Configuración de la pasarela de pago (Stripe)

Por qué Stripe: acepta tarjetas globalmente, tiene plan gratuito (solo cobra
% por transacción exitosa, sin mensualidad), soporta montos desde 1 USD, y
tiene Checkout (página de pago ya hecha, no necesitas construirla tú).

⚠️ Antes de activar pagos reales: lee los Términos de Servicio de Stripe
sobre "prohibited businesses". Servicios de "fortune telling" están
explícitamente prohibidos. Por eso el encuadre de marketing y los Términos
y Condiciones de Fontana describen el servicio como "acompañamiento e
inspiración personal con IA", NUNCA como adivinación o garantía de
resultados. Si Stripe pregunta en el onboarding qué vendes, descríbelo así:
"Servicio digital de coaching personal y contenido motivacional generado
por IA, con un componente de ritual simbólico de intención."

## Paso 1 — Crear la cuenta

1. Ve a https://dashboard.stripe.com/register
2. Completa el registro con los datos de tu persona natural o empresa.
3. Activa el modo de pruebas (Test mode) primero — NUNCA conectes pagos
   reales hasta probar todo el flujo de punta a punta.

## Paso 2 — Crear el producto

1. Dashboard > Product catalog > + Add product
2. Nombre: "Contribución Fontana"
3. Precio: marca "Customer chooses price" (el cliente elige el monto) con
   mínimo de $1.00 USD — esto te permite el modelo "desde 1 dólar en
   adelante" sin crear un producto por cada monto posible.
4. Guarda el `price_id` que se genera (algo como `price_1Nxxxxx`).

## Paso 3 — Crear el Checkout Session (código del backend)

Esto va en tu backend (puede ser una Supabase Edge Function, un endpoint
de Vercel, o un nodo HTTP de n8n). Aquí el ejemplo en Node.js:

```javascript
// crear-sesion-pago.js
// Endpoint: POST /api/crear-pago
// Body esperado: { wishId, amountUsd, email }

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async function handler(req, res) {
  const { wishId, amountUsd, email } = req.body;

  if (!wishId || !amountUsd || amountUsd < 1) {
    return res.status(400).json({ error: 'Datos inválidos' });
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    customer_email: email,
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: {
          name: 'Contribución Fontana',
          description: 'Ritual de deseo + acompañamiento de IA por 30 días',
        },
        unit_amount: Math.round(amountUsd * 100), // Stripe usa centavos
      },
      quantity: 1,
    }],
    metadata: {
      wish_id: wishId, // CRÍTICO: así el webhook sabe qué deseo activar
    },
    success_url: 'https://tudominio.com/gracias?wish=' + wishId,
    cancel_url: 'https://tudominio.com/?cancelado=1',
  });

  res.json({ checkoutUrl: session.url });
};
```

En el frontend, sustituye el botón "Ir a pagar →" del modal por una
llamada a este endpoint y luego `window.location = checkoutUrl`.

## Paso 4 — El webhook (la pieza más importante)

El webhook es lo que confirma que el dinero SÍ llegó, antes de activar el
deseo. Nunca actives un deseo solo porque el frontend dice "pago exitoso" —
eso se puede falsificar. Solo el webhook de Stripe es confiable.

1. Dashboard > Developers > Webhooks > + Add endpoint
2. URL del endpoint: la URL pública de tu automatización en n8n
   (ver sección de automatizaciones), por ejemplo:
   `https://tu-n8n.dominio.com/webhook/stripe-pago-confirmado`
3. Evento a escuchar: `checkout.session.completed`
4. Copia el "Signing secret" (`whsec_...`) — lo necesitas para verificar
   que el webhook viene realmente de Stripe y no de un atacante.

```javascript
// webhook-stripe.js — verifica la firma y activa el deseo
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

module.exports = async function handler(req, res) {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.rawBody, sig, endpointSecret);
  } catch (err) {
    return res.status(400).send(`Webhook error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const wishId = session.metadata.wish_id;

    // Aquí se llama a Supabase para activar el deseo:
    // UPDATE wishes SET status='active', cycle_started_at=now(),
    //   next_followup_at = now() + interval '7 days',
    //   stripe_payment_intent_id = session.payment_intent
    // WHERE id = wishId;
    //
    // Y se dispara la Automatización A (correo paso 1) — ver
    // /automations/README.md

  }

  res.json({ received: true });
};
```

## Paso 5 — Probar con tarjetas de prueba

Antes de salir a producción, usa estas tarjetas en modo Test:

| Resultado | Número de tarjeta     |
|-----------|------------------------|
| Pago exitoso | 4242 4242 4242 4242 |
| Pago rechazado | 4000 0000 0000 0002 |

Fecha de expiración: cualquier fecha futura. CVC: cualquier 3 dígitos.

## Paso 6 — Activar modo real (producción)

1. Completa la verificación de identidad/negocio que Stripe te solicite
   (puede pedir documento de identidad, datos bancarios para los payouts).
2. Cambia las llaves de `sk_test_...` a `sk_live_...` en tus variables de
   entorno.
3. Crea un webhook nuevo apuntando a la misma URL, pero en modo Live
   (los webhooks de test y live son independientes).
4. Haz una transacción real de $1 USD tú mismo para confirmar que todo
   el flujo (pago → webhook → activación → correo) funciona de punta a
   punta antes de anunciar el lanzamiento.

## Costos

Stripe no tiene mensualidad. Cobra aproximadamente 2.9% + $0.30 USD por
transacción exitosa (varía por país). Con una contribución de $1 USD,
Stripe se queda con ~$0.33, te quedan ~$0.67. Es importante comunicar
esto en tu plan financiero: con montos de $1, el margen por transacción
es bajo — el modelo de negocio funciona mejor si una parte relevante de
usuarios elige contribuir más de $1 (por eso el slider sugiere $3 por
defecto en la landing).
