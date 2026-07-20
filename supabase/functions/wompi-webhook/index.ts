// wompi-webhook/index.ts
// Recibe el evento de Wompi cuando el pago es aprobado,
// actualiza el deseo a 'active', y dispara correo + notificación Telegram.
// Secrets: WOMPI_EVENTS_SECRET (el "Secreto de eventos" de tu cuenta Wompi)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createHash } from "node:crypto";

const EVENTS_SECRET = Deno.env.get("WOMPI_EVENTS_SECRET")!;
const SUPA_URL      = Deno.env.get("SUPABASE_URL")!;
const SUPA_KEY      = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPA_URL, SUPA_KEY);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const event = await req.json();

    // ── Verificar firma de Wompi ─────────────────────────────────────────
    // Wompi envía: data.transaction.id + data.transaction.status +
    //              data.transaction.amount_in_cents + event.timestamp + EVENTS_SECRET
    const tx        = event?.data?.transaction;
    const timestamp = event?.timestamp;

    if (!tx || !timestamp) {
      return new Response("Invalid payload", { status: 400 });
    }

    const cadena = `${tx.id}${tx.status}${tx.amount_in_cents}${timestamp}${EVENTS_SECRET}`;
    const expected = createHash("sha256").update(cadena).digest("hex");
    const received = event?.signature?.checksum;

    console.log("DEBUG firma:", {
      txId: tx.id,
      status: tx.status,
      amount: tx.amount_in_cents,
      timestamp,
      secretPrimeros6: EVENTS_SECRET?.slice(0, 6),
      expected,
      received,
      coinciden: expected === received,
    });

    if (expected !== received) {
      console.error("Firma Wompi inválida");
      return new Response("Unauthorized", { status: 401 });
    }

    // ── Solo procesar pagos APROBADOS ────────────────────────────────────
    if (tx.status !== "APPROVED") {
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // La referencia es el wish_id que generamos en el frontend
    const rawRef = tx.reference as string;
    const parts = rawRef.split('-');
    // Referencia: FONTANA-{uuid-5-segmentos}-{timestamp}
    // partes:     [0]     [1,2,3,4,5]        [6]
    const wishId = parts.length >= 7
      ? parts.slice(1, 6).join('-')
      : rawRef;

    // ── Actualizar deseo a 'active' ──────────────────────────────────────
    const { data: wish, error } = await supabase
      .from("wishes")
      .update({
        status: "active",
        cycle_started_at: new Date().toISOString(),
        stripe_payment_intent_id: tx.id, // reutilizamos el campo para el ID de Wompi
      })
      .eq("id", wishId)
      .eq("status", "pending_payment") // solo si todavía está pendiente
      .select("*, profiles(email, full_name)")
      .maybeSingle();

    if (error) {
      console.error("Error actualizando wish:", error);
      return new Response(JSON.stringify({ error: "DB Error" }), {
        status: 500,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    if (!wish) {
      // El deseo ya no está en 'pending_payment' o no existe.
      // Wompi está haciendo un retry de algo que ya procesamos, así que devolvemos 200 OK.
      console.log("Deseo ya procesado o no encontrado para activacion:", wishId);
      return new Response(JSON.stringify({ ok: true, skipped: "already_active_or_not_found" }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // ── Disparar correo de confirmación al usuario ───────────────────────
    await fetch(`${SUPA_URL}/functions/v1/send-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SUPA_KEY}`,
      },
      body: JSON.stringify({
        type: "payment_confirmed",
        to: wish.contact_email,
        name: wish.profiles?.full_name ?? "",
        wishText: wish.wish_text,
        category: wish.category,
      }),
    });

    // ── Registrar el correo de confirmación en email_log ─────────────────
    await supabase.from("email_log").insert({
      wish_id: wishId,
      type: "step_one",
      subject: "Tu deseo ya está en marcha — próximas 24 horas",
      body_sent: "Correo automático de confirmación de pago (plantilla HTML)",
    });

    // ── Notificar a tu Telegram ──────────────────────────────────────────
    await fetch(`${SUPA_URL}/functions/v1/notify-telegram`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SUPA_KEY}`,
      },
      body: JSON.stringify({
        type: "new_wish",
        wishId: wish.id,
        email: wish.contact_email,
        wishText: wish.wish_text,
        category: wish.category,
        amountUsd: wish.amount_usd,
        alias: wish.donor_alias ?? null,
      }),
    });

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
