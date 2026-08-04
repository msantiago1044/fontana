// monitor/index.ts
// Health check completo de todos los servicios de Fontana.
// Puede ser invocado manualmente, por el comando /check del bot, o por cron horario.
//
// Secrets requeridos (los mismos que ya tiene la plataforma):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPA_URL  = Deno.env.get("SUPABASE_URL")!;
const SUPA_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const CHAT_ID   = Deno.env.get("TELEGRAM_CHAT_ID")!;

const supabase = createClient(SUPA_URL, SUPA_KEY);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Tipos ──────────────────────────────────────────────────────────────────────
interface ServiceResult {
  name: string;
  ok: boolean;
  ms: number;
  error?: string;
}

// ── Helper: medir tiempo de una petición ──────────────────────────────────────
async function probe(
  name: string,
  fn: () => Promise<void>
): Promise<ServiceResult> {
  const start = Date.now();
  try {
    await fn();
    return { name, ok: true, ms: Date.now() - start };
  } catch (e) {
    return { name, ok: false, ms: Date.now() - start, error: String(e) };
  }
}

// ── Telegram helper ───────────────────────────────────────────────────────────
async function sendTelegram(text: string) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: "HTML" }),
  });
}

// ── Checks individuales ───────────────────────────────────────────────────────
async function checkFrontend(): Promise<ServiceResult> {
  return probe("Frontend (fontanadigital.dpdns.org)", async () => {
    const res = await fetch("https://fontanadigital.dpdns.org", { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  });
}

async function checkEdgeFn(name: string, path: string, payload: object): Promise<ServiceResult> {
  return probe(name, async () => {
    const res = await fetch(`${SUPA_URL}/functions/v1/${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SUPA_KEY}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });
    // Cualquier respuesta HTTP (incluso 400/500) indica que la función está viva.
    // Solo consideramos fallo si hay un timeout o error de red.
    if (res.status === 0) throw new Error("Sin respuesta");
  });
}

async function checkDatabase(): Promise<ServiceResult> {
  return probe("Base de datos", async () => {
    const { error } = await supabase.from("wishes").select("id", { count: "exact", head: true });
    if (error) throw new Error(error.message);
  });
}

async function checkCrons(): Promise<{ result: ServiceResult; activeCount: number; totalCount: number }> {
  const cronNames = ["fontana-close-cycle", "fontana-daily-summary", "fontana-monitor-hourly"];
  const start = Date.now();
  try {
    const { data, error } = await supabase
      .from("cron.job")
      .select("jobname, active")
      .in("jobname", cronNames);

    if (error) {
      // Intentar con rpc si el acceso directo falla
      const { data: rpcData, error: rpcErr } = await supabase.rpc("get_cron_jobs");
      if (rpcErr) throw new Error(rpcErr.message);

      const jobs = (rpcData ?? []) as { jobname: string; active: boolean }[];
      const active = jobs.filter((j) => cronNames.includes(j.jobname) && j.active).length;
      const total = Math.min(jobs.filter((j) => cronNames.includes(j.jobname)).length, 2);
      const ok = active >= 1; // al menos el de cierre de ciclo
      return {
        result: { name: "Crons pg_cron", ok, ms: Date.now() - start, error: ok ? undefined : "Ningún cron activo" },
        activeCount: active,
        totalCount: Math.max(total, 1),
      };
    }

    const jobs = (data ?? []) as { jobname: string; active: boolean }[];
    const active = jobs.filter((j) => j.active).length;
    const total = jobs.length;
    const ok = active >= 1;

    return {
      result: { name: "Crons pg_cron", ok, ms: Date.now() - start, error: ok ? undefined : "Ningún cron activo encontrado" },
      activeCount: active,
      totalCount: Math.max(total, 1),
    };
  } catch (e) {
    return {
      result: { name: "Crons pg_cron", ok: false, ms: Date.now() - start, error: String(e) },
      activeCount: 0,
      totalCount: 2,
    };
  }
}

// ── Ejecutar todos los checks en paralelo ─────────────────────────────────────
async function runAllChecks() {
  const globalStart = Date.now();

  const [frontend, guardarDeseo, wompiWebhook, sendEmail, notifyTelegram, closeCycle, database] =
    await Promise.all([
      checkFrontend(),
      checkEdgeFn("guardar-deseo", "guardar-deseo", {}),
      checkEdgeFn("wompi-webhook", "wompi-webhook", {}),
      checkEdgeFn("send-email", "send-email", { type: "__health_check__" }),
      checkEdgeFn("notify-telegram", "notify-telegram", { type: "__health_check__" }),
      checkEdgeFn("close-cycle", "close-cycle", {}),
      checkDatabase(),
    ]);

  const { result: cronResult, activeCount, totalCount } = await checkCrons();

  const services: ServiceResult[] = [
    frontend,
    guardarDeseo,
    wompiWebhook,
    sendEmail,
    notifyTelegram,
    closeCycle,
    database,
    cronResult,
  ];

  const totalMs = Date.now() - globalStart;
  return { services, totalMs, activeCount, totalCount };
}

// ── Guardar estado actual en monitor_state ────────────────────────────────────
async function persistState(services: ServiceResult[]) {
  for (const s of services) {
    await supabase.from("monitor_state").upsert(
      {
        service_name: s.name,
        last_status: s.ok ? "ok" : "fail",
        last_checked_at: new Date().toISOString(),
        last_response_ms: s.ms,
        last_error: s.error ?? null,
      },
      { onConflict: "service_name" }
    );
  }
}

// ── Leer estado previo de monitor_state ───────────────────────────────────────
async function getPreviousState(): Promise<Map<string, string>> {
  const { data } = await supabase
    .from("monitor_state")
    .select("service_name, last_status");
  const map = new Map<string, string>();
  for (const row of data ?? []) {
    map.set(row.service_name, row.last_status);
  }
  return map;
}

// ── Alerta de Telegram para un servicio caído ─────────────────────────────────
async function alertFail(s: ServiceResult) {
  const ts = new Date().toLocaleString("es-CO", { timeZone: "America/Bogota" });
  await sendTelegram(
    `🚨 <b>ALERTA Fontana</b>\n` +
    `Servicio: <b>${s.name}</b>\n` +
    `Estado: ❌ Fallo\n` +
    `Error: ${s.error ?? "desconocido"}\n` +
    `Tiempo: ${ts}`
  );
}

async function alertRecovered(s: ServiceResult) {
  await sendTelegram(
    `✅ <b>Recuperado — Fontana</b>\n` +
    `Servicio: <b>${s.name}</b>\n` +
    `Estado: ✅ OK (${s.ms}ms)\n` +
    `El servicio volvió a responder correctamente.`
  );
}

// ── Handler principal ─────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const body = await req.json().catch(() => ({}));
    const silent = body.silent === true; // cron puede pedir modo silencioso

    const prevState = await getPreviousState();
    const { services, totalMs, activeCount, totalCount } = await runAllChecks();

    // Persistir nuevo estado
    await persistState(services);

    // Enviar alertas por cambios de estado
    for (const s of services) {
      const prev = prevState.get(s.name);
      const curr = s.ok ? "ok" : "fail";

      if (!s.ok && prev !== "fail") {
        // Pasó de ok → fail: alerta inmediata
        await alertFail(s);
      } else if (s.ok && prev === "fail") {
        // Pasó de fail → ok: notificación de recuperación
        await alertRecovered(s);
      } else if (!s.ok && !silent) {
        // Sigue fallando pero se pidió explícitamente (/check): siempre alertar
        await alertFail(s);
      }
    }

    // Construir reporte completo para devolver (lo usa /check)
    const emoji: Record<string, string> = {
      "Frontend (https://fontanadigital.dpdns.org)": "🌐",
      "guardar-deseo": "⚡",
      "wompi-webhook": "💳",
      "send-email": "📧",
      "notify-telegram": "📱",
      "close-cycle": "🔄",
      "Base de datos": "🗄️",
      "Crons pg_cron": "⏰",
    };

    const ts = new Date().toLocaleString("es-CO", { timeZone: "America/Bogota" });

    let report = `🔍 <b>Check completo — Fontana</b>\n${ts}\n\n`;
    for (const s of services) {
      const icon = emoji[s.name] ?? "•";
      const statusIcon = s.ok ? "✅" : "❌";
      if (s.name === "Crons pg_cron") {
        report += `${icon} Crons activos: ${statusIcon} ${activeCount}/${totalCount}\n`;
      } else {
        report += `${icon} ${s.name}: ${statusIcon} ${s.ms}ms${s.ok ? "" : ` — ${s.error}`}\n`;
      }
    }

    // Métricas rápidas de la base de datos
    const [
      { count: activeCount2 },
      { count: pendingCount },
      { count: completedCount },
      { data: amounts },
    ] = await Promise.all([
      supabase.from("wishes").select("*", { count: "exact", head: true }).eq("status", "active"),
      supabase.from("wishes").select("*", { count: "exact", head: true }).eq("status", "pending_payment"),
      supabase.from("wishes").select("*", { count: "exact", head: true }).eq("status", "completed"),
      supabase.from("wishes").select("amount_usd").in("status", ["active", "completed"]),
    ]);

    const totalRevenue = (amounts ?? []).reduce((sum: number, w: { amount_usd: string }) => sum + Number(w.amount_usd), 0);

    const todayStart = new Date();
    todayStart.setHours(todayStart.getHours() - 5);
    const todayStr = todayStart.toISOString().slice(0, 10);
    const { count: emailsToday } = await supabase
      .from("email_log")
      .select("*", { count: "exact", head: true })
      .gte("sent_at", `${todayStr}T05:00:00Z`);

    report +=
      `\n📊 <b>Métricas rápidas</b>\n` +
      `Deseos activos: ${activeCount2 ?? 0}\n` +
      `Pendientes de pago: ${pendingCount ?? 0}\n` +
      `Completados: ${completedCount ?? 0}\n` +
      `Ingresos totales: $${totalRevenue.toFixed(2)} USD\n` +
      `Correos enviados hoy: ${emailsToday ?? 0}\n` +
      `\n⚡ Tiempo total del check: ${totalMs}ms`;

    return new Response(
      JSON.stringify({ ok: true, report, services, totalMs }),
      { headers: { ...cors, "Content-Type": "application/json" } }
    );

  } catch (e) {
    console.error("[monitor] Error general:", e);
    return new Response(
      JSON.stringify({ error: String(e) }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }
});
