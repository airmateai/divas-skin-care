// Cobro con tarjeta en el centro mediante QR (Stripe Checkout) desde la caja del panel.
// Solo para el equipo con sesión iniciada en el panel. Acciones:
//   { accion:"crear", importe_cent, concepto }  → { id, url }
//   { accion:"estado", id }                      → { pagado, estado }
//   { accion:"cancelar", id }                    → { ok }
// La sesión lleva metadata.tipo="caja" y ningún producto con metadata: el webhook "stripe-webhook" la ignora
// (la venta la registra el propio panel cuando ve el pago confirmado).

import Stripe from "npm:stripe@17";
import { createClient } from "npm:@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20" });
const ORIGENES_OK = ["https://airmateai.github.io", "https://divasskincare.com", "https://www.divasskincare.com", "http://127.0.0.1:8799"];
const WEB = "https://divasskincare.com/";
const cors = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin && ORIGENES_OK.includes(origin) ? origin : ORIGENES_OK[1],
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
});
const json = (b: unknown, s: number, o: string | null) => new Response(JSON.stringify(b), { status: s, headers: { ...cors(o), "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405, origin);

  // Solo usuarios del panel (sesión real, no la clave pública de la web)
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
  const { data: u } = await sb.auth.getUser(token);
  if (!u?.user) return json({ error: "Inicia sesión en el panel" }, 401, origin);

  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { /* vacío */ }
  const accion = String(b.accion || "");

  try {
    if (accion === "crear") {
      const cent = Math.round(Number(b.importe_cent));
      if (!(cent >= 50 && cent <= 300000)) return json({ error: "Importe no válido (entre 0,50 € y 3.000 €)" }, 400, origin);
      const concepto = String(b.concepto || "Venta en el centro").slice(0, 200);
      const s = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [{ quantity: 1, price_data: { currency: "eur", unit_amount: cent, product_data: { name: "Divas Skin Care · Pago en el centro", description: concepto } } }],
        metadata: { tipo: "caja", usuario: u.user.email || "" },
        payment_intent_data: { description: "Caja Divas · " + concepto, metadata: { tipo: "caja" } },
        expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
        success_url: `${WEB}?pago=ok`,
        cancel_url: WEB,
      });
      return json({ id: s.id, url: s.url }, 200, origin);
    }
    const id = String(b.id || "");
    if (!/^cs_(live|test)_[A-Za-z0-9]+$/.test(id)) return json({ error: "Cobro no válido" }, 400, origin);
    const s = await stripe.checkout.sessions.retrieve(id);
    if (s.metadata?.tipo !== "caja") return json({ error: "Cobro no válido" }, 400, origin);
    if (accion === "estado") return json({ pagado: s.payment_status === "paid", estado: s.status, importe: (s.amount_total || 0) / 100 }, 200, origin);
    if (accion === "cancelar") { if (s.status === "open") await stripe.checkout.sessions.expire(id); return json({ ok: true }, 200, origin); }
    return json({ error: "Acción no válida" }, 400, origin);
  } catch (e) {
    return json({ error: (e as Error).message }, 500, origin);
  }
});
