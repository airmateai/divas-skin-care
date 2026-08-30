// Webhook de Stripe para Divas Skin Care.
// Al completarse un pago (checkout.session.completed), crea/actualiza la clienta
// y registra la cita como "pendiente de confirmar" en la tabla `citas`, usando
// el servicio_id guardado en la metadata del producto de Stripe.

import Stripe from "npm:stripe@17";
import { createClient } from "npm:@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-06-20",
});
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req) => {
  const sig = req.headers.get("stripe-signature");
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig!, webhookSecret);
  } catch (err) {
    console.error("Firma inválida:", (err as Error).message);
    return new Response(`Webhook Error: ${(err as Error).message}`, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
      expand: ["data.price.product"],
      limit: 1,
    });
    const product = lineItems.data[0]?.price?.product as Stripe.Product | undefined;
    const servicioId = product?.metadata?.servicio_id;

    const nombre = session.customer_details?.name || "Cliente Stripe";
    const email = session.customer_details?.email || null;
    const telefono = session.customer_details?.phone || null;

    if (!servicioId) {
      console.log("Sin servicio_id en metadata del producto, se ignora.");
      return new Response(JSON.stringify({ received: true }), { status: 200 });
    }

    // 1. Buscar o crear clienta por email
    let clientaId: string | null = null;
    if (email) {
      const { data: existing } = await supabase
        .from("clientas")
        .select("id")
        .eq("email", email)
        .maybeSingle();

      if (existing) {
        clientaId = existing.id;
      } else {
        const { data: created, error } = await supabase
          .from("clientas")
          .insert({ nombre, email, telefono })
          .select("id")
          .single();
        if (error) console.error("Error creando clienta:", error.message);
        else clientaId = created.id;
      }
    }

    // 2. Crear la cita como pendiente de confirmar (sin fecha asignada aún)
    const { error: citaError } = await supabase.from("citas").insert({
      cliente_nombre: nombre,
      cliente_telefono: telefono,
      cliente_email: email,
      servicio_id: servicioId,
      estado: "pendiente_confirmar",
      origen: "stripe",
      notas: `Pago recibido por Stripe (sesión ${session.id}). Falta asignar fecha/hora.`,
    });

    if (citaError) {
      console.error("Error creando cita:", citaError.message);
      return new Response(JSON.stringify({ received: true, error: citaError.message }), {
        status: 200,
      });
    }

    console.log(`Cita creada para ${nombre} (${email}) — servicio ${servicioId}`);
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 });
});
