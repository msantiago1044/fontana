import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
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
    const {
      userId, wishId, category, wishText, contactEmail,
      donorAlias, amountUsd, transactionId, reference
    } = await req.json();

    if (!userId || !wishText || !contactEmail) {
      return new Response(
        JSON.stringify({ error: "Faltan campos obligatorios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verificar que el usuario existe en profiles
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, has_active_wish")
      .eq("id", userId)
      .maybeSingle();

    if (!profile) {
      return new Response(
        JSON.stringify({ error: "Usuario no encontrado" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (profile.has_active_wish) {
      return new Response(
        JSON.stringify({ error: "Este usuario ya tiene un deseo activo" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Insertar el deseo como active directamente
    const { data, error } = await supabase
    .from("wishes")
    .insert({
      id: wishId || undefined,        // ← usa el ID del frontend
      user_id: userId,
      category,
      wish_text: wishText,
      contact_email: contactEmail,
      donor_alias: donorAlias || null,
      amount_usd: amountUsd,
      status: "pending_payment",      // ← pendiente hasta que Wompi confirme
      stripe_payment_intent_id: transactionId || reference
    })
    .select()
    .single();

    if (error) throw error;

    return new Response(
      JSON.stringify({ success: true, wishId: data.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (e) {
    return new Response(
      JSON.stringify({ error: String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});