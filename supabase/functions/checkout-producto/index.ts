// Tienda online de Divas Skin Care: crea el cobro de Stripe de UN producto con el precio
// que tenga en ese momento el stock del panel (nada de links fijos por producto).
// La web llama aquí con { producto_id }; el precio SIEMPRE se lee en el servidor.
// Al pagar, el webhook "stripe-webhook" crea el pedido (recogida en cabina) y descuenta stock.

import Stripe from "npm:stripe@17";
import { createClient } from "npm:@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20" });
const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const WEB = "https://airmateai.github.io/divas-skin-care/";
const ORIGENES_OK = ["https://airmateai.github.io", "https://divasskincare.com", "https://www.divasskincare.com"];
const cors = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin && ORIGENES_OK.includes(origin) ? origin : ORIGENES_OK[0],
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
});
const json = (body: unknown, status: number, origin: string | null) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(origin), "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405, origin);

  let productoId = "";
  try { productoId = String((await req.json())?.producto_id || ""); } catch { /* cuerpo vacío */ }
  if (!/^[0-9a-f-]{36}$/i.test(productoId)) return json({ error: "Producto no válido" }, 400, origin);

  const { data: p, error } = await supabase.from("stock")
    .select("id, nombre, marca, precio, cantidad, visible_web, imagen_url")
    .eq("id", productoId).maybeSingle();
  if (error || !p || !p.visible_web) return json({ error: "Este producto no está a la venta online" }, 404, origin);
  if ((p.cantidad ?? 0) <= 0) return json({ error: "Ahora mismo no queda stock de este producto" }, 409, origin);
  const centimos = Math.round(Number(p.precio) * 100);
  if (!(centimos >= 50)) return json({ error: "Este producto no tiene precio" }, 409, origin);

  const base = origin && ORIGENES_OK.includes(origin) ? origin + (origin.includes("github.io") ? "/divas-skin-care/" : "/") : WEB;
  const imagen = p.imagen_url ? new URL(p.imagen_url, WEB).href : undefined;

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{
      quantity: 1,
      price_data: {
        currency: "eur",
        unit_amount: centimos,
        product_data: {
          name: p.nombre,
          description: "Recogida en cabina · Divas Skin Care, La Laguna",
          ...(imagen ? { images: [imagen] } : {}),
          metadata: { producto_id: p.id, tipo: "producto" },
        },
      },
    }],
    phone_number_collection: { enabled: true },
    metadata: { producto_id: p.id, tipo: "producto" },
    success_url: `${base}?pedido=ok#tienda`,
    cancel_url: `${base}#tienda`,
    locale: "es",
  });

  return json({ url: session.url }, 200, origin);
});
