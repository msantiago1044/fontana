// notify-telegram/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const CHAT_ID   = Deno.env.get("TELEGRAM_CHAT_ID")!;
const SUPA_URL  = Deno.env.get("SUPABASE_URL")!;
const SUPA_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPA_URL, SUPA_KEY);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function sendTelegram(text: string, replyMarkup?: object) {
  const body: Record<string, unknown> = {
    chat_id: CHAT_ID,
    text,
    parse_mode: "HTML",
  };
  if (replyMarkup) body.reply_markup = replyMarkup;
  console.log("Enviando mensaje a Telegram al chatID:", CHAT_ID);
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.error("Error Telegram API:", await res.text());
  } else {
    console.log("Mensaje de Telegram enviado con exito");
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const body = await req.json();

    // ── A) Llamada interna: notificar nuevo deseo pagado ──────────────────
    if (body.type === "new_wish") {
      const { wishId, email, wishText, category, amountUsd, alias } = body;
      const msg =
        `🪙 <b>Nuevo deseo activo</b>\n\n` +
        `👤 <b>Correo:</b> ${email}\n` +
        `📂 <b>Categoría:</b> ${category}\n` +
        `💬 <b>Deseo:</b> ${wishText}\n` +
        `💵 <b>Monto:</b> $${amountUsd} USD\n` +
        (alias ? `🏷 <b>Alias ranking:</b> ${alias}\n` : "") +
        `\n🆔 <code>${wishId}</code>`;

      await sendTelegram(msg, {
        inline_keyboard: [[
          { text: "✉️ Responder", callback_data: `reply:${wishId}` },
        ]],
      });

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    if (body.type === "identity_filled") {
      const { wishId, email, wishText, name, age, context } = body;
      const msg =
        `📝 <b>Identidad del Deseo Completada</b>\n\n` +
        `👤 <b>Correo:</b> ${email}\n` +
        `🆔 <b>Deseo:</b> <code>${wishId}</code>\n` +
        `💬 <b>Deseo Original:</b> ${wishText}\n\n` +
        `🧑 <b>Nombre:</b> ${name || "N/A"}\n` +
        `🎂 <b>Edad:</b> ${age || "N/A"}\n` +
        `📖 <b>Contexto:</b> ${context || "N/A"}\n`;

      await sendTelegram(msg);

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // ── B) Callback del botón "Responder" ─────────────────────────────────
    if (body.callback_query) {
      const cb   = body.callback_query;
      const data = cb.data as string;

      if (data.startsWith("reply:")) {
        const wishId = data.replace("reply:", "");

        await supabase.from("telegram_bot_state").upsert({
          chat_id: CHAT_ID,
          step: "await_subject",
          wish_id: wishId,
          updated_at: new Date().toISOString(),
        });

        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ callback_query_id: cb.id }),
        });

        await sendTelegram(
          `✉️ <b>Respondiendo al deseo</b> <code>${wishId.slice(0, 8)}…</code>\n\n` +
          `Escribe el <b>asunto</b> del correo:`
        );
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // ── C) Mensajes de texto del bot ──────────────────────────────────────
    if (body.message?.text) {
      const text = body.message.text as string;

      // /cola y /pendientes — siempre disponibles, sin importar el estado
      if (text === "/cola" || text === "/pendientes") {
        const { data: pending } = await supabase
          .from("wishes_dashboard")
          .select("wish_id, contact_email, wish_text, emails_sent_count, days_elapsed")
          .eq("status", "active")
          .order("cycle_started_at", { ascending: true });

        if (!pending || pending.length === 0) {
          await sendTelegram("🟢 No hay deseos pendientes de atencion.");
        } else {
          let msg = `📋 <b>Cola de deseos activos</b> (mas antiguo primero)\n\n`;
          for (const [i, w] of pending.entries()) {
            const atendido = w.emails_sent_count > 0 ? "✅" : "⏳";
            msg += `${atendido} <b>#${i + 1}</b> · Dia ${w.days_elapsed} · ${w.emails_sent_count} correos\n`;
            msg += `📧 ${w.contact_email}\n`;
            msg += `💬 ${(w.wish_text as string).slice(0, 60)}...\n`;
            msg += `🆔 <code>${w.wish_id}</code>\n\n`;
          }
          await sendTelegram(msg);
        }

        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...cors, "Content-Type": "application/json" },
        });
      }

      // Flujo asunto/cuerpo — requiere estado activo
      const { data: state } = await supabase
        .from("telegram_bot_state")
        .select("*")
        .eq("chat_id", CHAT_ID)
        .maybeSingle();

      if (!state) {
        await sendTelegram(
          "No hay ningun deseo seleccionado para responder.\n" +
          "Usa el boton ✉️ Responder de una notificacion, o escribe /cola para ver los deseos activos."
        );
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...cors, "Content-Type": "application/json" },
        });
      }

      if (state.step === "await_subject") {
        await supabase.from("telegram_bot_state").update({
          step: "await_body",
          subject: text,
          updated_at: new Date().toISOString(),
        }).eq("chat_id", CHAT_ID);

        await sendTelegram(
          `✅ <b>Asunto guardado:</b> ${text}\n\nAhora escribe el <b>cuerpo</b> del correo:`
        );

      } else if (state.step === "await_body") {
        const wishId  = state.wish_id;
        const subject = state.subject;
        const bodyTxt = text;

        const { data: wish } = await supabase
          .from("wishes")
          .select("contact_email")
          .eq("id", wishId)
          .maybeSingle();

        if (!wish) {
          await sendTelegram(`❌ No encontre el deseo <code>${wishId}</code>`);
        } else {
          const sendRes = await fetch(`${SUPA_URL}/functions/v1/send-email`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${SUPA_KEY}`,
            },
            body: JSON.stringify({
              type: "manual_reply",
              to: wish.contact_email,
              subject,
              body: bodyTxt,
              wishId,
            }),
          });

          if (sendRes.ok) {
            await supabase.from("telegram_bot_state").delete().eq("chat_id", CHAT_ID);
            await sendTelegram(
              `✅ <b>Correo enviado</b> a ${wish.contact_email}\n` +
              `📋 Asunto: ${subject}\n` +
              `📝 Registrado en email_log ✓`
            );
          } else {
            await sendTelegram(`❌ Error al enviar el correo. Intenta de nuevo.`);
          }
        }
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

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
