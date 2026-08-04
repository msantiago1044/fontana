// telegram-bot/index.ts
// Edge Function que recibe updates de Telegram vía webhook
// Maneja comandos: /cola, /deseo, /stats, /enviado, /nota, /respuesta
// También maneja callbacks de botones inline y el flujo de respuesta de correos
// Solo responde al TELEGRAM_CHAT_ID autorizado

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

// ── Helper: enviar mensaje a Telegram ──────────────────────────────────────────
async function sendTelegram(text: string, replyMarkup?: object) {
  const body: Record<string, unknown> = {
    chat_id: CHAT_ID,
    text,
    parse_mode: "HTML",
  };
  if (replyMarkup) body.reply_markup = replyMarkup;

  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.error("Error Telegram API:", await res.text());
  }
}

// ── Helper: buscar deseo por ID parcial (mínimo 6 chars) ────────────────────
async function findWishByShortId(shortId: string) {
  // Intentar primero coincidencia exacta
  const { data: exact } = await supabase
    .from("wishes")
    .select("*")
    .eq("id", shortId)
    .maybeSingle();
  if (exact) return exact;

  // Buscar por prefijo (mínimo 6 caracteres)
  if (shortId.length >= 6) {
    const { data: matches } = await supabase
      .from("wishes")
      .select("*")
      .like("id", `${shortId}%`);
    if (matches && matches.length === 1) return matches[0];
    if (matches && matches.length > 1) return "ambiguous";
  }
  return null;
}

// ── Helper: formatear fecha legible ────────────────────────────────────────────
function fmtDate(d: string | null): string {
  if (!d) return "N/A";
  return new Date(d).toLocaleDateString("es-CO", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
    timeZone: "America/Bogota",
  });
}

// ── Comando /cola ──────────────────────────────────────────────────────────────
async function handleCola() {
  const { data: pending } = await supabase
    .from("wishes_dashboard")
    .select("wish_id, contact_email, donor_alias, category, days_elapsed, emails_sent_count, wish_text")
    .eq("status", "active")
    .order("cycle_started_at", { ascending: true });

  if (!pending || pending.length === 0) {
    await sendTelegram("🟢 No hay deseos activos en la cola.");
    return;
  }

  let msg = `📋 <b>Cola de deseos activos</b> (${pending.length})\n\n`;
  for (const [i, w] of pending.entries()) {
    const atendido = w.emails_sent_count > 0 ? "✅" : "⏳";
    const nombre = w.donor_alias || w.contact_email;
    msg += `${atendido} <b>#${i + 1}</b> · Día ${w.days_elapsed} · ${w.emails_sent_count} correos\n`;
    msg += `👤 ${nombre}\n`;
    msg += `📂 ${w.category}\n`;
    msg += `💬 ${(w.wish_text as string).slice(0, 50)}…\n`;
    msg += `🆔 <code>${(w.wish_id as string).slice(0, 8)}</code>\n\n`;
  }
  await sendTelegram(msg);
}

// ── Comando /deseo [ID] ────────────────────────────────────────────────────────
async function handleDeseo(shortId: string) {
  if (!shortId) {
    await sendTelegram("⚠️ Uso: <code>/deseo [ID]</code>\nEjemplo: <code>/deseo a1b2c3d4</code>");
    return;
  }

  const wish = await findWishByShortId(shortId);
  if (wish === "ambiguous") {
    await sendTelegram("⚠️ Ese ID coincide con varios deseos. Usa más caracteres.");
    return;
  }
  if (!wish) {
    await sendTelegram(`❌ No encontré ningún deseo con ID <code>${shortId}</code>`);
    return;
  }

  // Obtener conteo de emails
  const { count: emailCount } = await supabase
    .from("email_log")
    .select("*", { count: "exact", head: true })
    .eq("wish_id", wish.id);

  // Obtener último email
  const { data: lastEmail } = await supabase
    .from("email_log")
    .select("type, subject, sent_at")
    .eq("wish_id", wish.id)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const daysActive = wish.cycle_started_at
    ? Math.max(0, Math.floor((Date.now() - new Date(wish.cycle_started_at).getTime()) / 86400000))
    : 0;

  let msg = `🔍 <b>Detalle del deseo</b>\n\n`;
  msg += `🆔 <code>${wish.id}</code>\n`;
  msg += `📊 Estado: <b>${wish.status}</b>\n`;
  msg += `📧 Email: ${wish.contact_email}\n`;
  msg += `📂 Categoría: ${wish.category}\n`;
  msg += `💵 Monto: $${wish.amount_usd} USD\n`;
  msg += `🏷 Alias: ${wish.donor_alias || "—"}\n`;
  msg += `📅 Inicio: ${fmtDate(wish.cycle_started_at)}\n`;
  msg += `⏱ Días activo: ${daysActive}\n`;
  msg += `✉️ Correos enviados: ${emailCount ?? 0}\n`;
  if (lastEmail) {
    msg += `📬 Último correo: ${lastEmail.type} — ${fmtDate(lastEmail.sent_at)}\n`;
  }
  msg += `\n💬 <b>Deseo completo:</b>\n${wish.wish_text}\n`;

  if (wish.identity_name || wish.identity_age || wish.identity_context) {
    msg += `\n🧑 <b>Identidad:</b>\n`;
    msg += `  Nombre: ${wish.identity_name || "—"}\n`;
    msg += `  Edad: ${wish.identity_age || "—"}\n`;
    msg += `  Contexto: ${wish.identity_context || "—"}\n`;
  }

  if (wish.internal_notes) {
    msg += `\n📝 <b>Notas internas:</b>\n${wish.internal_notes}\n`;
  }

  await sendTelegram(msg, {
    inline_keyboard: [[
      { text: "✉️ Responder", callback_data: `reply:${wish.id}` },
    ]],
  });
}

// ── Comando /stats ─────────────────────────────────────────────────────────────
async function handleStats() {
  // Total deseos activos
  const { count: activeCount } = await supabase
    .from("wishes")
    .select("*", { count: "exact", head: true })
    .eq("status", "active");

  // Total deseos pending_payment
  const { count: pendingCount } = await supabase
    .from("wishes")
    .select("*", { count: "exact", head: true })
    .eq("status", "pending_payment");

  // Correos enviados hoy (UTC-5 Colombia)
  const todayColombia = new Date();
  todayColombia.setHours(todayColombia.getHours() - 5); // Ajuste a Colombia
  const todayStr = todayColombia.toISOString().slice(0, 10);
  const startOfDay = `${todayStr}T05:00:00.000Z`; // 00:00 Colombia = 05:00 UTC
  const endOfDay = `${todayStr}T29:00:00.000Z`;

  const { count: emailsToday } = await supabase
    .from("email_log")
    .select("*", { count: "exact", head: true })
    .gte("sent_at", startOfDay);

  // Monto total ingresado (deseos activos + completed)
  const { data: amounts } = await supabase
    .from("wishes")
    .select("amount_usd")
    .in("status", ["active", "completed"]);

  const totalAmount = (amounts ?? []).reduce((sum, w) => sum + Number(w.amount_usd), 0);

  // Deseos completados
  const { count: completedCount } = await supabase
    .from("wishes")
    .select("*", { count: "exact", head: true })
    .eq("status", "completed");

  let msg = `📊 <b>Estadísticas de Fontana</b>\n\n`;
  msg += `🟢 Deseos activos: <b>${activeCount ?? 0}</b>\n`;
  msg += `⏳ Pendientes de pago: <b>${pendingCount ?? 0}</b>\n`;
  msg += `✅ Completados: <b>${completedCount ?? 0}</b>\n`;
  msg += `\n✉️ Correos enviados hoy: <b>${emailsToday ?? 0}</b>\n`;
  msg += `💰 Monto total ingresado: <b>$${totalAmount.toFixed(2)} USD</b>\n`;
  msg += `\n📅 Fecha: ${new Date().toLocaleDateString("es-CO", { timeZone: "America/Bogota", weekday: "long", year: "numeric", month: "long", day: "numeric" })}`;

  await sendTelegram(msg);
}

// ── Comando /enviado [ID] ──────────────────────────────────────────────────────
async function handleEnviado(shortId: string) {
  if (!shortId) {
    await sendTelegram("⚠️ Uso: <code>/enviado [ID]</code>\nRegistra que enviaste un correo manual.");
    return;
  }

  const wish = await findWishByShortId(shortId);
  if (wish === "ambiguous") {
    await sendTelegram("⚠️ ID ambiguo. Usa más caracteres.");
    return;
  }
  if (!wish) {
    await sendTelegram(`❌ No encontré el deseo <code>${shortId}</code>`);
    return;
  }

  const { error } = await supabase.from("email_log").insert({
    wish_id: wish.id,
    type: "manual",
    subject: "Correo manual registrado desde Telegram",
    body_sent: null,
    sent_at: new Date().toISOString(),
  });

  if (error) {
    await sendTelegram(`❌ Error al registrar: ${error.message}`);
  } else {
    await sendTelegram(
      `✅ <b>Correo manual registrado</b>\n` +
      `🆔 <code>${(wish.id as string).slice(0, 8)}</code>\n` +
      `📧 ${wish.contact_email}\n` +
      `📅 ${fmtDate(new Date().toISOString())}`
    );
  }
}

// ── Comando /nota [ID] [texto] ─────────────────────────────────────────────────
async function handleNota(args: string) {
  const parts = args.trim().split(/\s+/);
  const shortId = parts[0];
  const noteText = parts.slice(1).join(" ");

  if (!shortId || !noteText) {
    await sendTelegram("⚠️ Uso: <code>/nota [ID] [texto]</code>\nEjemplo: <code>/nota a1b2c3 Cliente responde mañana</code>");
    return;
  }

  const wish = await findWishByShortId(shortId);
  if (wish === "ambiguous") {
    await sendTelegram("⚠️ ID ambiguo. Usa más caracteres.");
    return;
  }
  if (!wish) {
    await sendTelegram(`❌ No encontré el deseo <code>${shortId}</code>`);
    return;
  }

  // Append to existing notes
  const existingNotes = wish.internal_notes || "";
  const timestamp = new Date().toLocaleDateString("es-CO", {
    timeZone: "America/Bogota", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
  });
  const newNotes = existingNotes
    ? `${existingNotes}\n[${timestamp}] ${noteText}`
    : `[${timestamp}] ${noteText}`;

  const { error } = await supabase
    .from("wishes")
    .update({ internal_notes: newNotes })
    .eq("id", wish.id);

  if (error) {
    await sendTelegram(`❌ Error al guardar nota: ${error.message}`);
  } else {
    await sendTelegram(
      `📝 <b>Nota guardada</b>\n` +
      `🆔 <code>${(wish.id as string).slice(0, 8)}</code>\n` +
      `💬 ${noteText}`
    );
  }
}

// ── Comando /respuesta [ID] [texto] ────────────────────────────────────────────
async function handleRespuesta(args: string) {
  const parts = args.trim().split(/\s+/);
  const shortId = parts[0];
  const replyText = parts.slice(1).join(" ");

  if (!shortId || !replyText) {
    await sendTelegram(
      "⚠️ Uso: <code>/respuesta [ID] [texto]</code>\n" +
      "Registra la respuesta de un correo manual del usuario."
    );
    return;
  }

  const wish = await findWishByShortId(shortId);
  if (wish === "ambiguous") {
    await sendTelegram("⚠️ ID ambiguo. Usa más caracteres.");
    return;
  }
  if (!wish) {
    await sendTelegram(`❌ No encontré el deseo <code>${shortId}</code>`);
    return;
  }

  const { error } = await supabase.from("email_log").insert({
    wish_id: wish.id,
    type: "manual_reply",
    subject: "Respuesta del usuario registrada desde Telegram",
    body_sent: replyText,
    sent_at: new Date().toISOString(),
  });

  if (error) {
    await sendTelegram(`❌ Error al registrar respuesta: ${error.message}`);
  } else {
    await sendTelegram(
      `💬 <b>Respuesta registrada</b>\n` +
      `🆔 <code>${(wish.id as string).slice(0, 8)}</code>\n` +
      `📧 ${wish.contact_email}\n` +
      `📝 ${replyText.slice(0, 200)}${replyText.length > 200 ? "…" : ""}`
    );
  }
}

// ── Comando /alerta48 — verificar deseos sin actividad (manual o cron) ────────
async function handleAlerta48() {
  const { data: stale } = await supabase
    .from("wishes_dashboard")
    .select("wish_id, contact_email, donor_alias, category, days_elapsed, emails_sent_count, last_email_sent_at")
    .eq("status", "active");

  const now = Date.now();
  const staleWishes = (stale ?? []).filter(w => {
    const started = w.cycle_started_at;
    // Si no tiene correos y lleva más de 48h activo
    if (w.emails_sent_count === 0) {
      return w.days_elapsed >= 2;
    }
    // Si tiene correos pero el último fue hace más de 48h
    if (w.last_email_sent_at) {
      const lastSent = new Date(w.last_email_sent_at).getTime();
      return (now - lastSent) > 48 * 3600 * 1000;
    }
    return false;
  });

  if (staleWishes.length === 0) {
    await sendTelegram("✅ No hay deseos sin atención por más de 48h.");
    return;
  }

  let msg = `⚠️ <b>Alerta: ${staleWishes.length} deseo(s) sin actividad (+48h)</b>\n\n`;
  for (const w of staleWishes) {
    const nombre = w.donor_alias || w.contact_email;
    msg += `🔴 ${nombre} · Día ${w.days_elapsed} · ${w.emails_sent_count} correos\n`;
    msg += `   📂 ${w.category}\n`;
    msg += `   🆔 <code>${(w.wish_id as string).slice(0, 8)}</code>\n\n`;
  }
  await sendTelegram(msg);
}

// ── Resumen diario (llamado por cron o /resumen) ──────────────────────────────
async function handleResumenDiario() {
  const { count: activeCount } = await supabase
    .from("wishes")
    .select("*", { count: "exact", head: true })
    .eq("status", "active");

  const { data: activeWishes } = await supabase
    .from("wishes_dashboard")
    .select("wish_id, contact_email, donor_alias, category, days_elapsed, emails_sent_count")
    .eq("status", "active")
    .order("cycle_started_at", { ascending: true });

  // Correos ayer
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yStr = yesterday.toISOString().slice(0, 10);
  const { count: emailsYesterday } = await supabase
    .from("email_log")
    .select("*", { count: "exact", head: true })
    .gte("sent_at", `${yStr}T05:00:00Z`)
    .lt("sent_at", new Date().toISOString().slice(0, 10) + "T05:00:00Z");

  let msg = `☀️ <b>Resumen diario — Fontana</b>\n`;
  msg += `📅 ${new Date().toLocaleDateString("es-CO", { timeZone: "America/Bogota", weekday: "long", year: "numeric", month: "long", day: "numeric" })}\n\n`;
  msg += `🟢 Deseos activos: <b>${activeCount ?? 0}</b>\n`;
  msg += `✉️ Correos enviados ayer: <b>${emailsYesterday ?? 0}</b>\n\n`;

  if (activeWishes && activeWishes.length > 0) {
    msg += `<b>Detalle de la cola:</b>\n`;
    for (const [i, w] of activeWishes.entries()) {
      const atendido = w.emails_sent_count > 0 ? "✅" : "⏳";
      const nombre = w.donor_alias || w.contact_email;
      msg += `${atendido} #${i + 1} · ${nombre} · Día ${w.days_elapsed} · ${w.emails_sent_count} ✉️\n`;
    }
  }

  // Bloque de estado de servicios (desde monitor_state)
  try {
    const { data: monitorData } = await supabase
      .from("monitor_state")
      .select("service_name, last_status, last_response_ms")
      .order("service_name", { ascending: true });

    if (monitorData && monitorData.length > 0) {
      msg += `\n📡 <b>Estado de servicios</b>\n`;
      for (const s of monitorData) {
        const icon = s.last_status === "ok" ? "✅" : "❌";
        const ms = s.last_response_ms ? ` ${s.last_response_ms}ms` : "";
        msg += `${s.service_name}: ${icon}${ms}\n`;
      }
    }
  } catch (_) {
    // Si monitor_state no existe aún, silenciar el error
  }

  await sendTelegram(msg);
}

// ── Comando /help ──────────────────────────────────────────────────────────────
async function handleHelp() {
  const msg =
    `🪙 <b>Fontana Bot — Comandos</b>\n\n` +
    `📋 /cola — Lista deseos activos\n` +
    `🔍 /deseo [ID] — Detalle completo de un deseo\n` +
    `📊 /stats — Estadísticas generales\n` +
    `✉️ /enviado [ID] — Registra correo manual enviado\n` +
    `📝 /nota [ID] [texto] — Guardar nota interna\n` +
    `💬 /respuesta [ID] [texto] — Registrar respuesta del usuario\n` +
    `⚠️ /alerta48 — Ver deseos sin actividad +48h\n` +
    `☀️ /resumen — Resumen diario manual\n` +
    `🔍 /check — Health check completo de servicios\n` +
    `❓ /help — Este mensaje`;
  await sendTelegram(msg);
}

// ── Comando /check — Health check completo via función monitor ─────────────────
async function handleCheck() {
  await sendTelegram("🔄 Ejecutando health check... un momento.");
  try {
    const res = await fetch(`${SUPA_URL}/functions/v1/monitor`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SUPA_KEY}`,
      },
      body: JSON.stringify({ silent: false }),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      const errText = await res.text();
      await sendTelegram(`❌ Error en monitor: ${errText}`);
      return;
    }

    const data = await res.json();
    if (data.report) {
      await sendTelegram(data.report);
    } else {
      await sendTelegram("✅ Check completado, pero sin reporte detallado.");
    }
  } catch (e) {
    await sendTelegram(`❌ Error al ejecutar check: ${String(e)}`);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Handler principal
// ══════════════════════════════════════════════════════════════════════════════
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const body = await req.json();

    // ── Llamada de cron: resumen diario o alerta 48h ──────────────────────
    if (body.type === "cron_daily_summary") {
      await handleResumenDiario();
      await handleAlerta48();
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    if (body.type === "cron_alert_48h") {
      await handleAlerta48();
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // ── Callback de botón inline (Responder) ─────────────────────────────
    if (body.callback_query) {
      const cb = body.callback_query;
      const chatId = String(cb.message?.chat?.id || cb.from?.id);
      
      // Seguridad: solo responder a mi chat
      if (chatId !== CHAT_ID) {
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...cors, "Content-Type": "application/json" },
        });
      }

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

    // ── Mensajes de texto del bot ────────────────────────────────────────
    if (body.message?.text) {
      const chatId = String(body.message.chat.id);
      const text = body.message.text as string;

      // Seguridad: solo responder a mi chat
      if (chatId !== CHAT_ID) {
        console.log(`Mensaje ignorado de chat no autorizado: ${chatId}`);
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...cors, "Content-Type": "application/json" },
        });
      }

      // ── Comandos ──────────────────────────────────────────────────────
      if (text === "/cola" || text === "/cola@fontana_wish_bot") {
        await handleCola();
        return okResponse();
      }

      if (text === "/stats" || text === "/stats@fontana_wish_bot") {
        await handleStats();
        return okResponse();
      }

      if (text === "/alerta48" || text === "/alerta48@fontana_wish_bot") {
        await handleAlerta48();
        return okResponse();
      }

      if (text === "/resumen" || text === "/resumen@fontana_wish_bot") {
        await handleResumenDiario();
        return okResponse();
      }

      if (text === "/check" || text === "/check@fontana_wish_bot") {
        await handleCheck();
        return okResponse();
      }

      if (text === "/help" || text === "/start" || text === "/help@fontana_wish_bot" || text === "/start@fontana_wish_bot") {
        await handleHelp();
        return okResponse();
      }

      if (text.startsWith("/deseo ") || text.startsWith("/deseo@fontana_wish_bot ")) {
        const shortId = text.replace(/^\/deseo(@fontana_wish_bot)?\s*/, "").trim();
        await handleDeseo(shortId);
        return okResponse();
      }

      if (text.startsWith("/enviado ") || text.startsWith("/enviado@fontana_wish_bot ")) {
        const shortId = text.replace(/^\/enviado(@fontana_wish_bot)?\s*/, "").trim();
        await handleEnviado(shortId);
        return okResponse();
      }

      if (text.startsWith("/nota ") || text.startsWith("/nota@fontana_wish_bot ")) {
        const args = text.replace(/^\/nota(@fontana_wish_bot)?\s*/, "").trim();
        await handleNota(args);
        return okResponse();
      }

      if (text.startsWith("/respuesta ") || text.startsWith("/respuesta@fontana_wish_bot ")) {
        const args = text.replace(/^\/respuesta(@fontana_wish_bot)?\s*/, "").trim();
        await handleRespuesta(args);
        return okResponse();
      }

      // ── Flujo de respuesta de correo (asunto → cuerpo) ────────────────
      const { data: state } = await supabase
        .from("telegram_bot_state")
        .select("*")
        .eq("chat_id", CHAT_ID)
        .maybeSingle();

      if (state) {
        if (state.step === "await_subject") {
          await supabase.from("telegram_bot_state").update({
            step: "await_body",
            subject: text,
            updated_at: new Date().toISOString(),
          }).eq("chat_id", CHAT_ID);

          await sendTelegram(
            `✅ <b>Asunto guardado:</b> ${text}\n\nAhora escribe el <b>cuerpo</b> del correo:`
          );
          return okResponse();

        } else if (state.step === "await_body") {
          const wishId = state.wish_id;
          const subject = state.subject;
          const bodyTxt = text;

          const { data: wish } = await supabase
            .from("wishes")
            .select("contact_email")
            .eq("id", wishId)
            .maybeSingle();

          if (!wish) {
            await sendTelegram(`❌ No encontré el deseo <code>${wishId}</code>`);
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
              const errTxt = await sendRes.text();
              await sendTelegram(`❌ Error al enviar correo: ${errTxt}`);
            }
          }
          return okResponse();
        }
      }

      // Mensaje no reconocido
      await sendTelegram(
        "🤔 No reconozco ese comando.\nEscribe /help para ver los comandos disponibles."
      );
      return okResponse();
    }

    return okResponse();

  } catch (e) {
    console.error("Error en telegram-bot:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});

function okResponse() {
  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
