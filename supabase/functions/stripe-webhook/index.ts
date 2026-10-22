// Webhook de Stripe para Divas Skin Care.
// Al completarse un pago (checkout.session.completed), crea/actualiza la clienta
// y registra:
//  - una cita "pendiente de confirmar" en `citas`, si el producto de Stripe trae servicio_id
//  - un pedido "pendiente de preparar" en `pedidos`, si el producto de Stripe trae producto_id

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

    // Tarjeta regalo: se marca como pagada y se avisa en el panel
    if (session.metadata?.tipo === "regalo" && session.metadata?.tarjeta_id) {
      const tid = session.metadata.tarjeta_id;
      const { data: t, error: eT } = await supabase.from("tarjetas_regalo").update({
        estado: "pagada",
        pagada_en: new Date().toISOString(),
        comprador_nombre: session.customer_details?.name || null,
        comprador_email: session.customer_details?.email || null,
        comprador_telefono: session.customer_details?.phone || null,
        stripe_session: session.id,
      }).eq("id", tid).eq("estado", "pendiente_pago").select("codigo, importe, servicio_nombre, productos, presentacion, para").maybeSingle();
      if (eT) console.error("Error marcando tarjeta regalo:", eT.message);
      else if (t) {
        const que = t.servicio_nombre || `${Number(t.importe).toFixed(2).replace(".", ",")} €`;
        const { error: eN } = await supabase.from("notificaciones").insert({
          tipo: "regalo",
          mensaje: `🎁 Tarjeta regalo vendida online: ${que} · código ${t.codigo}`,
        });
        if (eN) console.error("Error creando notificación:", eN.message);
        // Regalo de productos: pedido para preparar (cesta o envuelto) y se descuenta el stock
        for (const p of ((Array.isArray(t.productos) ? t.productos : []) as { id: string; nombre: string; qty: number; tipo?: string; bajo_pedido?: boolean }[]).filter((x) => x.tipo !== "servicio")) {
          const { error: eP } = await supabase.from("pedidos").insert({
            cliente_nombre: session.customer_details?.name || "Regalo",
            cliente_telefono: session.customer_details?.phone || null,
            cliente_email: session.customer_details?.email || null,
            producto_id: p.id,
            estado: "pendiente_preparar",
            origen: "regalo",
            notas: `🎁 REGALO ${t.presentacion === "cesta" ? "EN CESTA" : "ENVUELTO"}${p.bajo_pedido ? " · BAJO PEDIDO (encargar en su talla)" : ""} · ${p.qty > 1 ? p.qty + " unidades · " : ""}código ${t.codigo}${t.para ? " · para " + t.para : ""}. Pagado online. Se recoge en cabina con el código.`,
          });
          if (eP) console.error("Error creando pedido de regalo:", eP.message);
          const { data: art } = p.bajo_pedido ? { data: null } : await supabase.from("stock").select("cantidad").eq("id", p.id).maybeSingle();
          if (art) {
            const { error: eS } = await supabase.from("stock").update({ cantidad: Math.max(0, (art.cantidad ?? 0) - (p.qty || 1)) }).eq("id", p.id);
            if (eS) console.error("Error descontando stock (regalo):", eS.message);
          }
        }
        console.log(`Tarjeta regalo ${t.codigo} pagada`);
      }
      return new Response(JSON.stringify({ received: true }), { status: 200 });
    }

    const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
      expand: ["data.price.product"],
      limit: 1,
    });
    const product = lineItems.data[0]?.price?.product as Stripe.Product | undefined;
    const servicioId = product?.metadata?.servicio_id;
    const productoId = product?.metadata?.producto_id;
    const esDeposito = product?.metadata?.tipo === "deposito";

    const nombre = session.customer_details?.name || "Cliente Stripe";
    const email = session.customer_details?.email || null;
    const telefono = session.customer_details?.phone || null;

    if (esDeposito) {
      const citaId = session.client_reference_id;
      if (!citaId) {
        console.log("Pago de depósito sin client_reference_id, no se puede vincular a ninguna cita.");
        return new Response(JSON.stringify({ received: true }), { status: 200 });
      }

      const { error: updateError } = await supabase
        .from("citas")
        .update({
          estado: "confirmada",
          notas: "Depósito de 20€ pagado por Stripe. Reserva confirmada.",
        })
        .eq("id", citaId);

      if (updateError) {
        console.error("Error confirmando cita tras depósito:", updateError.message);
      } else {
        console.log(`Cita ${citaId} confirmada tras pago de depósito.`);
      }

      return new Response(JSON.stringify({ received: true }), { status: 200 });
    }

    if (!servicioId && !productoId) {
      console.log("Sin servicio_id ni producto_id en metadata del producto, se ignora.");
      return new Response(JSON.stringify({ received: true }), { status: 200 });
    }

    // Buscar o crear clienta por email (compartido entre citas y pedidos)
    if (email) {
      const { data: existing } = await supabase
        .from("clientas")
        .select("id")
        .eq("email", email)
        .maybeSingle();

      if (!existing) {
        const { error } = await supabase
          .from("clientas")
          .insert({ nombre, email, telefono });
        if (error) console.error("Error creando clienta:", error.message);
      }
    }

    if (servicioId) {
      // Crear la cita como pendiente de confirmar (sin fecha asignada aún)
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
      } else {
        console.log(`Cita creada para ${nombre} (${email}) — servicio ${servicioId}`);
      }
    }

    if (productoId) {
      // Crear el pedido como pendiente de preparar
      const { error: pedidoError } = await supabase.from("pedidos").insert({
        cliente_nombre: nombre,
        cliente_telefono: telefono,
        cliente_email: email,
        producto_id: productoId,
        estado: "pendiente_preparar",
        origen: "stripe",
        notas: `Pagado online (${((session.amount_total ?? 0) / 100).toFixed(2).replace('.', ',')} €). Recoge en cabina. Sesión ${session.id}.`,
      });

      if (pedidoError) {
        console.error("Error creando pedido:", pedidoError.message);
      } else {
        console.log(`Pedido creado para ${nombre} (${email}) — producto ${productoId}`);
        // Descontar 1 unidad del stock (venta online, recogida en cabina)
        const { data: art } = await supabase.from("stock").select("cantidad,nombre").eq("id", productoId).maybeSingle();
        const { error: eNp } = await supabase.from("notificaciones").insert({
          tipo: "compra_online",
          mensaje: `🛍️ Compra online: ${art?.nombre ?? "producto"} · ${nombre} (recoge en cabina)`,
        });
        if (eNp) console.error("Error creando notificación de pedido:", eNp.message);
        if (art) {
          const { error: stockError } = await supabase.from("stock")
            .update({ cantidad: Math.max(0, (art.cantidad ?? 0) - 1) }).eq("id", productoId);
          if (stockError) console.error("Error descontando stock:", stockError.message);
        }
      }
    }
  }

  // Cobro presencial con tarjeta (Tap to Pay en la app de Stripe): queda pendiente para registrarlo en la caja del panel
  if (event.type === "payment_intent.succeeded") {
    const pi = event.data.object as Stripe.PaymentIntent;
    const presencial = (pi.payment_method_types || []).some((t) => t === "card_present" || t === "interac_present");
    if (presencial && !pi.metadata?.tipo) {
      let tarjeta: string | null = null;
      try {
        const ch = pi.latest_charge ? await stripe.charges.retrieve(String(pi.latest_charge)) : null;
        const cp = ch?.payment_method_details?.card_present;
        if (cp) tarjeta = `${(cp.brand || "tarjeta").toUpperCase()} ···· ${cp.last4 || ""}`.trim();
      } catch { /* sin detalle de tarjeta */ }
      const importe = (pi.amount_received || pi.amount || 0) / 100;
      const { error } = await supabase.from("cobros_tpv").upsert({ stripe_pi: pi.id, importe, tarjeta }, { onConflict: "stripe_pi", ignoreDuplicates: true });
      if (error) console.error("Error guardando cobro TPV:", error.message);
      else {
        await supabase.from("notificaciones").insert({ tipo: "cobro_tpv", mensaje: `💳 Cobro con tarjeta de ${importe.toFixed(2).replace(".", ",")} € (Tap to Pay): regístralo en la caja` });
        console.log(`Cobro TPV ${pi.id} guardado (${importe} €)`);
      }
    }
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 });
});
