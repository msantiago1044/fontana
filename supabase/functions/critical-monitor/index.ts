// critical-monitor/index.ts
// Monitoreo proactivo de componentes CRÍTICOS cada 15 minutos.
// Solo verifica: wompi-webhook, guardar-deseo, Supabase DB
// Usa la tabla monitor_estado para evitar spam de alertas duplicadas.
// Solo alerta cuando el estado cambia de OK → FALLO (o viceversa).
//
// Secrets requeridos (ya configurados en el proyecto):
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
interface CheckResult {
  name: string;
  ok: boolean;
  ms: number;
  error?: string;
}

// ── Impacto en producción por componente ───────────────────────────────────────
const criticalImpact: Record<string, string> = {
  "wompi-webhook": "Los webhooks de pago de Wompi no se procesarán. Los pagos no activarán deseos.",
  "guardar-deseo": "No se pueden crear nuevos deseos. La persistencia en base de datos falla.",
  "Supabase DB":   "La base de datos no responde. Todo el sistema está comprometido.",
};

// ── Helper: probe de componente ────────────────────────────────────────────────
async function probeComponent(
  name: string,
  fn: () => Promise<void>
): Promise<CheckResult> {
  const start = Date.now();
  try {
    await fn();
    return { name, ok: true, ms: Date.now() - start };
  } catch (e) {
    return { name, ok: false, ms: Date.now() - start, error: String(e) };
  }
}

// ── Helper: enviar mensaje a Telegram y devolver message_id ───────────────────
async function sendTelegramWithId(text: string): Promise<number | null> {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: "HTML" }),
  });
  if (!res.ok) {
    console.error("[critical-monitor] Error Telegram sendMessage:", await res.text());
    return null;
  }
  const data = await res.json();
  return data?.result?.message_id ?? null;
}

// ── Helper: pin de mensaje ─────────────────────────────────────────────────────
async function pinMessage(messageId: number) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/pinChatMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      message_id: messageId,
      disable_notification: false,
    }),
  });
  if (!res.ok) {
    console.error("[critical-monitor] Error pinChatMessage:", await res.text());
  }
}

// ── Checks individuales de componentes críticos ────────────────────────────────
async function checkWompiWebhook(): Promise<CheckResult> {
  return probeComponent("wompi-webhook", async () => {
    const res = await fetch(`${SUPA_URL}/functions/v1/wompi-webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SUPA_KEY}` },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(10000),
    });
    if (res.status === 0) throw new Error("Sin respuesta de red");
  });
}

async function checkGuardarDeseo(): Promise<CheckResult> {
  return probeComponent("guardar-deseo", async () => {
    const res = await fetch(`${SUPA_URL}/functions/v1/guardar-deseo`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SUPA_KEY}` },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(10000),
    });
    if (res.status === 0) throw new Error("Sin respuesta de red");
  });
}

async function checkSupabaseDB(): Promise<CheckResult> {
  return probeComponent("Supabase DB", async () => {
    const { error } = await supabase
      .from("wishes")
      .select("id", { count: "exact", head: true });
    if (error) throw new Error(error.message);
  });
}

// ── Leer estado previo desde monitor_estado ────────────────────────────────────
async function getPreviousState(): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from("monitor_estado")
    .select("componente, ultimo_estado");

  if (error) {
    console.error("[critical-monitor] Error leyendo monitor_estado:", error.message);
    return new Map();
  }

  const map = new Map<string, string>();
  for (const row of data ?? []) {
    map.set(row.componente, row.ultimo_estado);
  }
  return map;
}

// ── Guardar estado actual en monitor_estado ────────────────────────────────────
async function persistState(results: CheckResult[]) {
  for (const r of results) {
    const { error } = await supabase.from("monitor_estado").upsert(
      {
        componente:    r.name,
        ultimo_estado: r.ok ? "ok" : "fail",
        ultima_vez:    new Date().toISOString(),
      },
      { onConflict: "componente" }
    );
    if (error) {
      console.error(`[critical-monitor] Error persistiendo estado de ${r.name}:`, error.message);
    }
  }
}

// ── Handler principal ──────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  // ── Guard: solo cron / admin con service_role key ───────────────────────
  const callerKey = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (callerKey !== SUPA_KEY) {
    return new Response(JSON.stringify({ error: "No autorizado" }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  try {
    console.log("[critical-monitor] Iniciando verificación de componentes críticos...");

    // 1. Leer estado previo
    const prevState = await getPreviousState();

    // 2. Ejecutar checks en paralelo
    const [wompi, guardar, db] = await Promise.all([
      checkWompiWebhook(),
      checkGuardarDeseo(),
      checkSupabaseDB(),
    ]);

    const results: CheckResult[] = [wompi, guardar, db];

    // 3. Persistir nuevo estado
    await persistState(results);

    // 4. Evaluar cambios de estado y enviar alertas
    const alerts: string[] = [];
    const recoveries: string[] = [];

    for (const r of results) {
      const prev = prevState.get(r.name);
      const curr = r.ok ? "ok" : "fail";

      console.log(`[critical-monitor] ${r.name}: prev=${prev ?? "desconocido"} curr=${curr} ms=${r.ms}`);

      if (!r.ok && prev !== "fail") {
        // OK → FAIL: enviar alerta crítica con pin
        const impact = criticalImpact[r.name] ?? "Componente crítico no disponible.";
        const alertText =
          `🔴 <b>ALERTA CRÍTICA — Fontana</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━━━\n` +
          `Componente: <b>${r.name}</b>\n` +
          `Estado: FALLO\n` +
          `${impact}\n` +
          `⚠️ Acción requerida inmediata.`;

        const msgId = await sendTelegramWithId(alertText);
        if (msgId) {
          await pinMessage(msgId);
          alerts.push(r.name);
        }

      } else if (r.ok && prev === "fail") {
        // FAIL → OK: enviar mensaje de recuperación
        const recoveryText =
          `✅ <b>RECUPERADO — Fontana</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━━━\n` +
          `Componente: <b>${r.name}</b>\n` +
          `Volvió a funcionar correctamente.`;

        await sendTelegramWithId(recoveryText);
        recoveries.push(r.name);
      }
      // Si ya estaba fallando (prev=fail && curr=fail): NO enviar, evitar spam
      // Si sigue OK (prev=ok && curr=ok): no hacer nada
    }

    const summary = {
      ok: true,
      results: results.map(r => ({ name: r.name, ok: r.ok, ms: r.ms })),
      alerts,
      recoveries,
      timestamp: new Date().toISOString(),
    };

    console.log("[critical-monitor] Completado:", JSON.stringify(summary));

    return new Response(
      JSON.stringify(summary),
      { headers: { ...cors, "Content-Type": "application/json" } }
    );

  } catch (e) {
    console.error("[critical-monitor] Error general:", e);
    return new Response(
      JSON.stringify({ error: "Error interno del servidor" }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }
});
