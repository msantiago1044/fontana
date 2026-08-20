// close-cycle/index.ts
// Cron job diario: cierra los deseos cuyo ciclo de 30 días ha vencido.
// Invocado automáticamente cada día a las 14:00 UTC (9am Colombia) por pg_cron.
//
// Para cada wish activo con cycle_due_at <= now() y followup_finished_manual = false:
//   1. Envía correo de cierre (type: cycle_complete)
//   2. Actualiza wish → status: completed, followup_finished_manual: true, final_email_sent_manual: true
//   3. Actualiza profiles → has_active_wish: false
//   4. Registra en email_log
//   5. Notifica a Telegram

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const SUPA_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPA_URL, SUPA_KEY);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  // ── Guard: esta función es solo para cron / admin ─────────────────────────
  const authHeader = req.headers.get("Authorization") ?? "";
  const callerKey = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (callerKey !== SUPA_KEY) {
    return new Response(JSON.stringify({ error: "No autorizado" }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const results: { wishId: string; email: string; status: string; error?: string }[] = [];

  try {
    // ── 1. Buscar deseos vencidos ──────────────────────────────────────────
    const { data: wishes, error: fetchErr } = await supabase
      .from("wishes")
      .select("id, user_id, contact_email, wish_text, category, amount_usd")
      .eq("status", "active")
      .eq("followup_finished_manual", false)
      .lte("cycle_due_at", new Date().toISOString());

    if (fetchErr) {
      throw new Error(`Error consultando wishes: ${fetchErr.message}`);
    }

    if (!wishes || wishes.length === 0) {
      console.log("[close-cycle] No hay deseos vencidos hoy.");
      return new Response(
        JSON.stringify({ ok: true, processed: 0, message: "No hay deseos vencidos." }),
        { headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    console.log(`[close-cycle] Procesando ${wishes.length} deseo(s) vencido(s).`);

    // ── 2. Procesar cada deseo ─────────────────────────────────────────────
    for (const wish of wishes) {
      try {
        // 2a. Enviar correo de cierre
        const emailResp = await fetch(`${SUPA_URL}/functions/v1/send-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${SUPA_KEY}`,
          },
          body: JSON.stringify({
            type: "cycle_complete",
            to: wish.contact_email,
          }),
        });

        if (!emailResp.ok) {
          const emailErr = await emailResp.text();
          throw new Error(`Error enviando correo: ${emailErr}`);
        }

        // 2b. Actualizar wishes: marcar como completed
        const { error: wishUpdateErr } = await supabase
          .from("wishes")
          .update({
            status: "completed",
            final_email_sent_manual: true,
            followup_finished_manual: true,
            final_email_sent_at: new Date().toISOString(),
            followup_finished_at: new Date().toISOString(),
          })
          .eq("id", wish.id)
          .eq("status", "active"); // doble check de seguridad

        if (wishUpdateErr) {
          throw new Error(`Error actualizando wish: ${wishUpdateErr.message}`);
        }

        // 2c. Liberar al usuario para un nuevo deseo
        const { error: profileUpdateErr } = await supabase
          .from("profiles")
          .update({ has_active_wish: false })
          .eq("id", wish.user_id);

        if (profileUpdateErr) {
          console.warn(`[close-cycle] Error actualizando profile ${wish.user_id}: ${profileUpdateErr.message}`);
          // No lanzamos error aquí para no frenar el proceso; el trigger sync_has_active_wish debería manejarlo
        }

        // 2d. Registrar en email_log
        await supabase.from("email_log").insert({
          wish_id: wish.id,
          type: "cycle_complete",
          subject: "Tu ciclo en Fontana ha llegado a su fin ✨",
          body_sent: "Correo automático de cierre de ciclo (30 días) enviado por close-cycle cron.",
          sent_at: new Date().toISOString(),
        });

        // 2e. Notificar a Telegram
        await fetch(`${SUPA_URL}/functions/v1/notify-telegram`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${SUPA_KEY}`,
          },
          body: JSON.stringify({
            type: "cycle_closed",
            wishId: wish.id,
            email: wish.contact_email,
            wishText: wish.wish_text,
            category: wish.category,
          }),
        });

        results.push({ wishId: wish.id, email: wish.contact_email, status: "closed" });
        console.log(`[close-cycle] ✅ Deseo ${wish.id} cerrado exitosamente.`);

      } catch (wishError) {
        const errMsg = String(wishError);
        results.push({ wishId: wish.id, email: wish.contact_email, status: "error", error: errMsg });
        console.error(`[close-cycle] ❌ Error procesando deseo ${wish.id}:`, errMsg);
        // Continuamos con el siguiente deseo en vez de abortar
      }
    }

    const closed = results.filter(r => r.status === "closed").length;
    const errors = results.filter(r => r.status === "error").length;

    return new Response(
      JSON.stringify({ ok: true, processed: wishes.length, closed, errors, results }),
      { headers: { ...cors, "Content-Type": "application/json" } }
    );

  } catch (e) {
    console.error("[close-cycle] Error general:", e);
    return new Response(
      JSON.stringify({ error: "Error interno del servidor", results }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }
});
