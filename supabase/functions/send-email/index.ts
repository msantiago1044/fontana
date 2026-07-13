// send-email/index.ts
// Envía correos con Gmail SMTP en 4 situaciones:
//   1. welcome           → usuario se registra (login con Google)
//   2. reminder_24h      → usuario registrado que no pagó en 24h
//   3. payment_confirmed → usuario pagó → correo inmediato
//   4. manual_reply      → tú respondes desde Telegram
//
// Secrets requeridos en Supabase:
//   SMTP_HOST     = smtp.gmail.com
//   SMTP_PORT     = 587
//   SMTP_USER     = fontanadigital.ai@gmail.com
//   SMTP_PASS     = tu_app_password_sin_espacios   (16 caracteres)
//   SMTP_FROM_NAME= La Fuente — Fontana

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SmtpClient } from "https://deno.land/x/smtp@v0.7.0/mod.ts";

const SMTP_HOST      = Deno.env.get("SMTP_HOST")      ?? "smtp.gmail.com";
const SMTP_PORT      = parseInt(Deno.env.get("SMTP_PORT") ?? "587");
const SMTP_USER      = Deno.env.get("SMTP_USER")!;
const SMTP_PASS      = Deno.env.get("SMTP_PASS")!;
const SMTP_FROM_NAME = Deno.env.get("SMTP_FROM_NAME") ?? "Fontana";
const FROM_HEADER    = `${SMTP_FROM_NAME} <${SMTP_USER}>`;

const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const SUPA_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPA_URL, SUPA_KEY);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ── SMTP helper ───────────────────────────────────────────────────────────────
async function sendEmail(to: string, subject: string, html: string) {
  const client = new SmtpClient();

  await client.connectTLS({
    hostname: SMTP_HOST,
    port: SMTP_PORT,
    username: SMTP_USER,
    password: SMTP_PASS,
  });

  await client.send({
    from: FROM_HEADER,
    to,
    subject,
    content: "Este correo requiere un cliente que soporte HTML.",
    html,
  });

  await client.close();
}

// ── Plantilla base ────────────────────────────────────────────────────────────
function emailBase(body: string) {
  return `
<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
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

    // ── 1. Bienvenida al registrarse ─────────────────────────────────────────
    if (type === "welcome") {
      const { to, name } = body;
      const firstName = (name || "").split(" ")[0] || "viajero";

      await sendEmail(
        to,
        "Bienvenido a Fontana — tu intención ya fue recibida",
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

    // ── 2. Recordatorio 24 h (disparado por pg_cron) ─────────────────────────
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
            <p>La fuente todavía está aquí. Si estás listo para dar el paso,
               solo necesitas completar la contribución desde $1 USD.</p>
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

    // ── 3. Confirmación de pago ───────────────────────────────────────────────
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

    // ── 4. Respuesta manual desde Telegram ───────────────────────────────────
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
