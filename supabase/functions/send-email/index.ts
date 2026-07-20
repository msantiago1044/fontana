// send-email/index.ts
// Envía correos usando Gmail API via OAuth2 con fetch nativo — sin librerías SMTP
// Secrets requeridos:
//   GMAIL_CLIENT_ID      → Google Cloud Console → OAuth 2.0
//   GMAIL_CLIENT_SECRET  → Google Cloud Console → OAuth 2.0
//   GMAIL_REFRESH_TOKEN  → generado con OAuth Playground
//   GMAIL_FROM_NAME      → "La Fuente — Fontana"
//   GMAIL_FROM_EMAIL     → fontanadigital.ai@gmail.com

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CLIENT_ID     = Deno.env.get("GMAIL_CLIENT_ID")!;
const CLIENT_SECRET = Deno.env.get("GMAIL_CLIENT_SECRET")!;
const REFRESH_TOKEN = Deno.env.get("GMAIL_REFRESH_TOKEN")!;
const FROM_NAME     = Deno.env.get("GMAIL_FROM_NAME") ?? "Fontana";
const FROM_EMAIL    = Deno.env.get("GMAIL_FROM_EMAIL") ?? "fontanadigital.ai@gmail.com";

const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const SUPA_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPA_URL, SUPA_KEY);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Obtener access token desde refresh token ──────────────────────────────────
async function getAccessToken(): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Token error: ${JSON.stringify(data)}`);
  return data.access_token;
}

// ── Enviar correo via Gmail API ───────────────────────────────────────────────
async function sendEmail(to: string, subject: string, html: string) {
  const accessToken = await getAccessToken();

  const message = [
    `From: ${FROM_NAME} <${FROM_EMAIL}>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset=UTF-8`,
    ``,
    html,
  ].join("\r\n");

  const encoded = btoa(unescape(encodeURIComponent(message)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const res = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw: encoded }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gmail API error: ${err}`);
  }
  return res.json();
}

// ── Plantilla base ────────────────────────────────────────────────────────────
function emailBase(body: string) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<style>
  body{background:#f5f3ee;font-family:Georgia,serif;margin:0;padding:40px 0;}
  .card{background:#fff;max-width:560px;margin:0 auto;padding:48px 40px;border-radius:12px;}
  .coin{font-size:36px;text-align:center;margin-bottom:24px;}
  .logo{text-align:center;font-size:22px;color:#c9a14a;letter-spacing:.05em;margin-bottom:32px;}
  p{color:#3a3530;font-size:16px;line-height:1.8;margin:0 0 16px;}
  .footer{text-align:center;font-size:12px;color:#9a9690;margin-top:32px;}
  a{color:#c9a14a;}
</style></head>
<body><div class="card">
  <div class="coin">🪙</div>
  <div class="logo">font<em>a</em>na</div>
  ${body}
  <div class="footer">
    Fe y trabajo ·
    <a href="https://fontana-vert.vercel.app">fontana</a> ·
    <a href="mailto:fontanadigital.ai@gmail.com">fontanadigital.ai@gmail.com</a>
  </div>
</div></body></html>`;
}

// ── Handler principal ─────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const body = await req.json();
    const { type } = body;

    // 1. Bienvenida
    if (type === "welcome") {
      const { to, name } = body;
      const firstName = (name || "").split(" ")[0] || "viajero";
      await sendEmail(
        to,
        "Bienvenido a Fontana - tu intencion ya fue recibida",
        emailBase(`
          <p>Hola, ${firstName}.</p>
          <p>Tu cuenta en Fontana está lista. La fuente ya sabe que estás aquí.</p>
          <p>Cuando estés listo, pide tu deseo desde
            <a href="https://fontana-vert.vercel.app">nuestra página</a>.
            Con una contribución desde $1 USD, el sistema de IA empieza a trabajar en él de inmediato.
          </p>
          <p><em>Fe y trabajo.</em></p>
        `)
      );
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // 2. Recordatorio 24h
    if (type === "reminder_24h") {
      const { data: pending } = await supabase
        .from("wishes")
        .select("contact_email, wish_text, user_id")
        .eq("status", "pending_payment")
        .gte("created_at", new Date(Date.now() - 25 * 3600 * 1000).toISOString())
        .lte("created_at", new Date(Date.now() - 23 * 3600 * 1000).toISOString());

      for (const w of pending ?? []) {
        await sendEmail(
          w.contact_email,
          "Tu deseo todavía te está esperando",
          emailBase(`
            <p>Hola,</p>
            <p>Hace 24 horas dejaste un deseo a medias en Fontana.</p>
            <p>La fuente todavía está aquí. Con una contribución desde $1 USD das el paso.</p>
            <p><a href="https://fontana-vert.vercel.app">Retomar mi deseo →</a></p>
            <p><em>Fe y trabajo.</em></p>
          `)
        );
      }
      return new Response(
        JSON.stringify({ ok: true, sent: pending?.length ?? 0 }),
        { headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    // 3. Confirmación de pago
    if (type === "payment_confirmed") {
      const { to, name } = body;
      const firstName = (name || "").split(" ")[0] || "viajero";
      await sendEmail(
        to,
        "Tu deseo ya está en marcha — próximas 24 horas",
        emailBase(`
          <p>Hola, ${firstName}.</p>
          <p>Tu contribución llegó. La fuente ya está trabajando en tu deseo.</p>
          <p>En las próximas 24 horas recibirás tu primer correo de acompañamiento:
             un paso concreto que puedes dar esta misma semana.</p>
          <p>Durante los próximos 30 días el sistema te irá enviando avances
             cada vez que detecte algo relevante para ti.</p>
          <p><em>Fe y trabajo.</em></p>
        `)
      );
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // 4. Respuesta manual desde Telegram
    if (type === "manual_reply") {
      const { to, subject, body: emailBody, wishId } = body;
      const htmlBody = emailBody
        .split("\n\n")
        .map((p: string) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
        .join("");
      await sendEmail(to, subject, emailBase(htmlBody));
      await supabase.from("email_log").insert({
        wish_id: wishId,
        type: "followup",
        subject,
        body_sent: emailBody,
        sent_at: new Date().toISOString(),
      });
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Tipo desconocido" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
