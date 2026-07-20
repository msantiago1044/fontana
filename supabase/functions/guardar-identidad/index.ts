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
    const { wishId, name, age, context } = await req.json();

    if (!wishId) {
      return new Response(
        JSON.stringify({ error: "Falta wishId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Actualizar el deseo con los datos de identidad
    const { data: wish, error } = await supabase
      .from("wishes")
      .update({
        identity_name: name || null,
        identity_age: age ? parseInt(age) : null,
        identity_context: context || null,
      })
      .eq("id", wishId)
      .select("*, profiles(email)")
      .maybeSingle();

    if (error) throw error;

    if (!wish) {
      return new Response(
        JSON.stringify({ error: "Deseo no encontrado" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Enviar notificación a Telegram (el segundo mensaje)
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
    return new Response(
      JSON.stringify({ error: String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
