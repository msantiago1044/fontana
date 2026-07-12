import { createHash } from "node:crypto";

const INTEGRITY_SECRET = Deno.env.get("WOMPI_INTEGRITY_SECRET")!;

Deno.serve(async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { reference, amountInCents, currency } = await req.json();

    if (!reference || !amountInCents || !currency) {
      return new Response(
        JSON.stringify({ error: "Faltan parámetros: reference, amountInCents, currency" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fórmula exacta de Wompi: referencia + monto_en_centavos + moneda + secreto
    const cadena = `${reference}${amountInCents}${currency}${INTEGRITY_SECRET}`;
    const signature = createHash("sha256").update(cadena).digest("hex");

    return new Response(
      JSON.stringify({ signature, reference }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});