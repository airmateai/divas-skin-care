// Tarjetas regalo de Divas Skin Care: crea la tarjeta (pendiente de pago) y el cobro de Stripe.
// La web manda { tipo: 'servicio'|'importe', servicio_id?, importe?, plantilla, para, de, mensaje }.
// El precio SIEMPRE se calcula aquí (servicio: precio con descuento si lo tiene; importe: 10–500 €).
// Al pagar, "stripe-webhook" marca la tarjeta como pagada y la clienta la descarga en PDF.

import Stripe from "npm:stripe@17";
import { createClient } from "npm:@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20" });
const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const WEB = "https://divasskincare.com/";
const ORIGENES_OK = ["https://divasskincare.com", "https://www.divasskincare.com", "https://airmateai.github.io"];
const PLANTILLAS = ["cumple", "madre", "padre", "navidad", "reyes", "detalle"];
const cors = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin && ORIGENES_OK.includes(origin) ? origin : ORIGENES_OK[0],
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
});
const json = (body: unknown, status: number, origin: string | null) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(origin), "Content-Type": "application/json" } });
const texto = (v: unknown, max: number) => String(v ?? "").replace(/[<>]/g, "").trim().slice(0, max) || null;
const ALFA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const trozo = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => ALFA[b % ALFA.length]).join("");

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405, origin);

  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { /* vacío */ }
  const tipo = b.tipo === "servicio" ? "servicio" : b.tipo === "importe" ? "importe" : null;
  if (!tipo) return json({ error: "Elige un servicio o un importe" }, 400, origin);
  const plantilla = PLANTILLAS.includes(String(b.plantilla)) ? String(b.plantilla) : "detalle";

  let importe = 0, servicioId: string | null = null, servicioNombre: string | null = null;
  if (tipo === "servicio") {
    const id = String(b.servicio_id || "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "Servicio no válido" }, 400, origin);
    const { data: s, error } = await supabase.from("servicios")
      .select("id, nombre, precio, precio_oferta, reservable").eq("id", id).maybeSingle();
    if (error || !s || s.reservable === false) return json({ error: "Este servicio no se puede regalar ahora" }, 404, origin);
    importe = Number(s.precio_oferta ?? s.precio);
    servicioId = s.id; servicioNombre = s.nombre;
  } else {
    importe = Math.round(Number(b.importe) * 100) / 100;
    if (!(importe >= 10 && importe <= 500)) return json({ error: "El importe tiene que estar entre 10 € y 500 €" }, 400, origin);
  }
  const centimos = Math.round(importe * 100);
  if (!(centimos >= 50)) return json({ error: "Este servicio no tiene precio" }, 409, origin);

  const codigo = `DIVAS-${trozo(4)}-${trozo(4)}`;
  const token = trozo(24);
  const caduca = new Date(); caduca.setMonth(caduca.getMonth() + 4);
  const { data: t, error: e1 } = await supabase.from("tarjetas_regalo").insert({
    codigo, token, tipo, servicio_id: servicioId, servicio_nombre: servicioNombre, importe, saldo: tipo === "importe" ? importe : null, plantilla,
    para: texto(b.para, 60), de: texto(b.de, 60), mensaje: texto(b.mensaje, 240),
    caduca: caduca.toISOString().slice(0, 10), estado: "pendiente_pago",
  }).select("id").single();
  if (e1 || !t) return json({ error: "No se pudo preparar la tarjeta, inténtalo de nuevo" }, 500, origin);

  const base = origin && ORIGENES_OK.includes(origin) ? origin + (origin.includes("github.io") ? "/divas-skin-care/" : "/") : WEB;
  const nombre = tipo === "servicio" ? `Tarjeta regalo · ${servicioNombre}` : `Tarjeta regalo · ${importe.toFixed(2).replace(".", ",").replace(",00", "")} €`;

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{
      quantity: 1,
      price_data: {
        currency: "eur",
        unit_amount: centimos,
        product_data: {
          name: nombre,
          description: "Divas Skin Care · La Laguna. Válida 4 meses. Al pagar, la descargas en PDF para imprimir o enviar.",
          metadata: { tipo: "regalo", tarjeta_id: t.id },
        },
      },
    }],
    phone_number_collection: { enabled: true },
    client_reference_id: t.id,
    metadata: { tipo: "regalo", tarjeta_id: t.id },
    success_url: `${base}regalo.html?id=${t.id}&t=${token}`,
    cancel_url: `${base}#regalo`,
    locale: "es",
  });
  await supabase.from("tarjetas_regalo").update({ stripe_session: session.id }).eq("id", t.id);

  return json({ url: session.url }, 200, origin);
});
