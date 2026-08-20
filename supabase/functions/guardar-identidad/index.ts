import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Cliente con SERVICE_ROLE para poder leer/escribir wishes
const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ── 1. Autenticar al usuario con el JWT del header ────────────────────
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();

    if (!jwt) {
      return new Response(
        JSON.stringify({ error: "No autorizado: falta token de sesión" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Crear cliente temporal con el JWT del usuario para validar identidad
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: `Bearer ${jwt}` } } }
    );

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "No autorizado: sesión inválida o expirada" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 2. Parsear body ───────────────────────────────────────────────────
    const { wishId, name, age, context, checkOnly } = await req.json();

    if (!wishId) {
      return new Response(
        JSON.stringify({ error: "Falta wishId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 3. checkOnly: verificar si ya tiene identidad (con guard de user_id) ──
    if (checkOnly) {
      const { data: wish, error } = await supabaseAdmin
        .from("wishes")
        .select("identity_name, identity_context")
        .eq("id", wishId)
        .eq("user_id", user.id)   // ← GUARD: solo puede consultar sus propios wishes
        .maybeSingle();

      if (error) throw error;

      if (!wish) {
        return new Response(
          JSON.stringify({ error: "Deseo no encontrado o no pertenece a tu cuenta" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const alreadyFilled = !!(wish.identity_name || wish.identity_context);

      return new Response(
        JSON.stringify({ success: true, alreadyFilled }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 4. Verificar que el wish pertenece al usuario autenticado ─────────
    const { data: existingWish, error: checkError } = await supabaseAdmin
      .from("wishes")
      .select("identity_name, identity_context")
      .eq("id", wishId)
      .eq("user_id", user.id)   // ← GUARD: solo puede modificar sus propios wishes
      .maybeSingle();

    if (checkError) throw checkError;

    if (!existingWish) {
      return new Response(
        JSON.stringify({ error: "Deseo no encontrado o no pertenece a tu cuenta" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (existingWish.identity_name || existingWish.identity_context) {
      return new Response(
        JSON.stringify({ error: "Este deseo ya tiene la información de identidad completa" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 5. Actualizar el deseo con los datos de identidad ─────────────────
    const { data: wish, error } = await supabaseAdmin
      .from("wishes")
      .update({
        identity_name: name || null,
        identity_age: age ? parseInt(age) : null,
        identity_context: context || null,
      })
      .eq("id", wishId)
      .eq("user_id", user.id)   // ← doble guard en el UPDATE
      .select("*, profiles(email)")
      .maybeSingle();

    if (error) throw error;

    // ── 6. Notificar a Telegram ───────────────────────────────────────────
    await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/notify-telegram`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({
        type: "identity_filled",
        wishId: wish.id,
        email: wish.profiles?.email || wish.contact_email,
        name,
        age,
        context,
        wishText: wish.wish_text,
      }),
    });

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (e) {
    // No exponer detalles internos en producción
    console.error("[guardar-identidad] Error:", e);
    return new Response(
      JSON.stringify({ error: "Error interno del servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
