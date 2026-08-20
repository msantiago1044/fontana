/**
 * _shared/helpers.ts
 * Utilidades comunes compartidas entre todas las Edge Functions de Fontana.
 * Importar con: import { corsHeaders, jsonResponse, errorResponse } from "../_shared/helpers.ts";
 */

// ── CORS headers comunes ──────────────────────────────────────────────────────
export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ── Helper: respuesta JSON con CORS ──────────────────────────────────────────
export function jsonResponse(
  body: unknown,
  status = 200,
  extra: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extra },
  });
}

// ── Helper: respuesta de error genérica (no expone stack traces) ─────────────
export function errorResponse(message: string, status = 500): Response {
  return jsonResponse({ error: message }, status);
}

// ── Helper: validar guard de service_role ────────────────────────────────────
/**
 * Extrae la Bearer key del header Authorization y la compara con la
 * SUPABASE_SERVICE_ROLE_KEY del entorno.
 * Devuelve true si el caller es autorizado (cron / admin).
 */
export function isServiceRole(req: Request): boolean {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const callerKey = (req.headers.get("Authorization") ?? "")
    .replace(/^Bearer\s+/i, "")
    .trim();
  return callerKey === serviceKey && serviceKey.length > 0;
}

// ── Helper: manejar preflight OPTIONS ───────────────────────────────────────
export function handleCors(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  return null;
}
