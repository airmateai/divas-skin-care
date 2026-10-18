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
  const tipo = b.tipo === "servicio" ? "servicio" : b.tipo === "importe" ? "importe" : b.tipo === "productos" ? "productos" : null;
  if (!tipo) return json({ error: "Elige un servicio, un importe o productos" }, 400, origin);
  const plantilla = PLANTILLAS.includes(String(b.plantilla)) ? String(b.plantilla) : "detalle";

  let importe = 0, servicioId: string | null = null, servicioNombre: string | null = null, sesiones: number | null = null;
  let productos: { id: string; nombre: string; qty: number; precio: number }[] | null = null, presentacion: string | null = null;
  if (tipo === "servicio") {
    const id = String(b.servicio_id || "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "Servicio no válido" }, 400, origin);
    const { data: s, error } = await supabase.from("servicios")
      .select("id, nombre, precio, precio_oferta, reservable, bonos").eq("id", id).maybeSingle();
    if (error || !s || s.reservable === false) return json({ error: "Este servicio no se puede regalar ahora" }, 404, origin);
    servicioId = s.id; servicioNombre = s.nombre;
    importe = Number(s.precio_oferta ?? s.precio);
    const n = Number(b.bono_sesiones || 0);
    if (n) {
      const bono = (Array.isArray(s.bonos) ? s.bonos : []).find((x: { sesiones: number; precio: number }) => Number(x?.sesiones) === n);
      if (!bono || !(Number(bono.precio) > 0)) return json({ error: "Ese bono ya no está disponible" }, 404, origin);
      importe = Number(bono.precio); sesiones = n; servicioNombre = `Bono ${n} sesiones · ${s.nombre}`;
    }
  } else if (tipo === "productos") {
    const pedidos = (Array.isArray(b.productos) ? b.productos : []) as { id: string; qty: number }[];
    const qty = new Map<string, number>();
    for (const x of pedidos) { const id = String(x?.id || ""); const q = Math.floor(Number(x?.qty)); if (/^[0-9a-f-]{36}$/i.test(id) && q > 0) qty.set(id, Math.min(5, (qty.get(id) || 0) + q)); }
    if (!qty.size || qty.size > 12) return json({ error: "Elige entre 1 y 12 productos" }, 400, origin);
    const { data: ps, error } = await supabase.from("stock").select("id, nombre, precio, cantidad, visible_web, bajo_pedido").in("id", [...qty.keys()]);
    if (error || !ps || ps.length !== qty.size) return json({ error: "Algún producto ya no está disponible" }, 404, origin);
    productos = [];
    for (const p of ps) {
      const q = qty.get(p.id)!;
      if (!p.visible_web || p.bajo_pedido) return json({ error: `${p.nombre} no se puede regalar online` }, 409, origin);
      if ((p.cantidad ?? 0) < q) return json({ error: `No queda stock suficiente de ${p.nombre}` }, 409, origin);
      if (!(Number(p.precio) > 0)) return json({ error: `${p.nombre} no tiene precio` }, 409, origin);
      productos.push({ id: p.id, nombre: p.nombre, qty: q, precio: Number(p.precio) });
      importe += Number(p.precio) * q;
    }
    importe = Math.round(importe * 100) / 100;
    presentacion = b.presentacion === "envuelto" ? "envuelto" : "cesta";
    const n = productos.reduce((a, p) => a + p.qty, 0);
    servicioNombre = `${presentacion === "cesta" ? "Cesta regalo" : "Regalo envuelto"} · ${n} producto${n > 1 ? "s" : ""}: ` + productos.map((p) => (p.qty > 1 ? p.qty + "× " : "") + p.nombre).join(", ");
    if (servicioNombre.length > 300) servicioNombre = servicioNombre.slice(0, 297) + "…";
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
    codigo, token, tipo, servicio_id: servicioId, servicio_nombre: servicioNombre, importe, saldo: tipo === "importe" ? importe : null, sesiones, productos, presentacion, plantilla,
    para: texto(b.para, 60), de: texto(b.de, 60), mensaje: texto(b.mensaje, 240),
    caduca: caduca.toISOString().slice(0, 10), estado: "pendiente_pago",
  }).select("id").single();
  if (e1 || !t) return json({ error: "No se pudo preparar la tarjeta, inténtalo de nuevo" }, 500, origin);

  const base = origin && ORIGENES_OK.includes(origin) ? origin + (origin.includes("github.io") ? "/divas-skin-care/" : "/") : WEB;
  const nombre = tipo === "importe" ? `Tarjeta regalo · ${importe.toFixed(2).replace(".", ",").replace(",00", "")} €` : `Tarjeta regalo · ${servicioNombre}`.slice(0, 250);

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{
      quantity: 1,
      price_data: {
        currency: "eur",
        unit_amount: centimos,
        product_data: {
          name: nombre,
          description: tipo === "productos"
            ? `Lo preparamos ${presentacion === "cesta" ? "en cesta" : "envuelto para regalo"} y se recoge en cabina (Divas Skin Care, La Laguna) con el código de la tarjeta. Válida 4 meses.`
            : "Divas Skin Care · La Laguna. Válida 4 meses. Al pagar, la descargas en PDF para imprimir o enviar.",
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
