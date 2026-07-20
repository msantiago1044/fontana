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
      .select("id")
      .eq("id", userId)
      .maybeSingle();

    if (!profile) {
      return new Response(
        JSON.stringify({ error: "Usuario no encontrado" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Comprobar la restricción real: no permitir si hay uno activo o completado
    const { data: existingWishes } = await supabase
      .from("wishes")
      .select("id, status")
      .eq("user_id", userId)
      .in("status", ["active", "completed"]);

    if (existingWishes && existingWishes.length > 0) {
      return new Response(
        JSON.stringify({ error: "Este usuario ya tiene un deseo activo o completado" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Si había un deseo en pending_payment anterior con un ID distinto, lo eliminamos
    // para cumplir con la restricción de base de datos de one_active_wish_per_user
    // (que incluye pending_payment en su Unique Index).
    if (wishId) {
      await supabase
        .from("wishes")
        .delete()
        .eq("user_id", userId)
        .eq("status", "pending_payment")
        .neq("id", wishId);
    }

    // Verificar si el deseo ya existe y su estado actual
    if (wishId) {
      const { data: existingWish } = await supabase
        .from("wishes")
        .select("status")
        .eq("id", wishId)
        .maybeSingle();

      if (existingWish && (existingWish.status === "active" || existingWish.status === "completed")) {
        // El deseo ya fue activado por el webhook de pago. No lo regresamos a pendiente.
        return new Response(
          JSON.stringify({ success: true, wishId, note: "Already active" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const wishRow: Record<string, unknown> = {
      id: wishId || undefined,
      user_id: userId,
      category,
      wish_text: wishText,
      contact_email: contactEmail,
      donor_alias: donorAlias || null,
      amount_usd: amountUsd,
      status: "pending_payment",
    };

    if (transactionId) {
      wishRow.stripe_payment_intent_id = transactionId;
    } else if (reference) {
      wishRow.stripe_payment_intent_id = reference;
    }

    const { data, error } = await supabase
      .from("wishes")
      .upsert(wishRow, { onConflict: "id" })
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