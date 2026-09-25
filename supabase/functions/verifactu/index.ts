// Puente entre el panel de Divas Skin Care y apiverifactu.eu (Servoweb).
// Las credenciales viven SOLO en los secrets de esta función:
//   VERIFACTU_URL            (la "URL del API" del email de alta, tal cual)
//   VERIFACTU_CLIENT_ID
//   VERIFACTU_CLIENT_SECRET
// Solo responde a usuarios con sesión iniciada en el panel (JWT de Supabase).
//
// Acciones (POST JSON { action, ... }):
//   resumen                  → datos de la cuenta (empresa, entorno pruebas/producción, consumo)
//   enviar_venta {venta_id}  → registra un ticket del TPV como factura simplificada (F2)
//   estado                   → consulta en Verifactu el estado de lo pendiente y lo guarda
//   prueba_libre {json_data} → SOLO en entorno de pruebas: envía un json_data tal cual (para ajustar formatos)

import { createClient } from "npm:@supabase/supabase-js@2";

// URL que da el proveedor en el email de alta, tal cual (p. ej. https://conexion.apiverifactu.eu/v2/)
const ENDPOINT = (Deno.env.get("VERIFACTU_URL") || "").replace(/\/+$/, "") + "/";
const CID = Deno.env.get("VERIFACTU_CLIENT_ID") || "";
const CSEC = Deno.env.get("VERIFACTU_CLIENT_SECRET") || "";
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

// ─── Sesión con el proveedor ───
let token: string | null = null, tokenAt = 0, modoAuth: string | null = null;
async function apiToken(forzar = false) {
  if (!forzar && token && Date.now() - tokenAt < 20 * 60_000) return token;
  const r = await fetch(ENDPOINT, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "auth_api", new_token: "new_token", grant_type: "client_credentials", client_id: CID, client_secret: CSEC }),
  });
  const j = await r.json().catch(() => ({}));
  if (!j.access_token) throw new Error("Login Verifactu fallido: " + (j.msg || j.message || r.status));
  token = j.access_token; tokenAt = Date.now();
  return token!;
}
// La documentación pública no dice en qué cabecera va el token: se prueban las formas habituales
// y se recuerda la que el proveedor acepta.
async function api(method: "GET" | "POST", datos: Record<string, unknown>) {
  const t = await apiToken();
  const modos = modoAuth ? [modoAuth] : ["bearer", "token", "body"];
  let ultimo: { status: number; j: any } = { status: 0, j: {} };
  for (const m of modos) {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (m === "bearer") headers["Authorization"] = "Bearer " + t;
    if (m === "token") headers["token"] = t;
    const extra = m === "body" ? { token: t, access_token: t } : {};
    let url = ENDPOINT, body: string | undefined;
    if (method === "GET") url += "?" + new URLSearchParams(Object.entries({ ...datos, ...extra }).map(([k, v]) => [k, String(v)]));
    else body = JSON.stringify({ ...datos, ...extra });
    const r = await fetch(url, { method, headers, body });
    const txt = await r.text();
    let j: any; try { j = JSON.parse(txt); } catch { j = { raw: txt.slice(0, 400) }; }
    ultimo = { status: r.status, j };
    if ((r.status === 401 || r.status === 403) && !modoAuth) continue;
    if (r.ok) modoAuth = m;
    return ultimo;
  }
  return ultimo;
}
let entorno: string | null = null;
async function resumen() {
  const r = await api("GET", { action: "account_summary" });
  const d = r.j?.data || r.j;
  entorno = d?.environment || entorno;
  return { status: r.status, cuenta: d, modo_auth: modoAuth };
}

// ─── Construcción del registro a partir de una venta del TPV ───
const r2 = (n: number) => Math.round(n * 100) / 100;
function lineasImpuesto(items: any[]) {
  const grupos: Record<string, { rate: number; base: number; amount: number }> = {};
  for (const it of items || []) {
    const linea = r2(Number(it.qty || 1) * Number(it.price || 0));
    const rate = Number(it.porcentaje_impuesto || 0);
    const base = r2(linea / (1 + rate / 100));
    const g = (grupos[rate] = grupos[rate] || { rate, base: 0, amount: 0 });
    g.base = r2(g.base + base); g.amount = r2(g.amount + (linea - base));
  }
  // IGIC (Canarias). Tipo 0 = exento (la clínica está actualmente exenta de IGIC).
  const exento = Deno.env.get("VERIFACTU_EXENTO") || "E1";
  return Object.values(grupos).map((g) => g.rate > 0
    ? { tax: "03", vatKey: "01", operation_rating: "S1", exempt_operation: "E0", base: g.base, rate: g.rate, amount: g.amount }
    : { tax: "03", vatKey: "01", operation_rating: "", exempt_operation: exento, base: g.base, rate: 0, amount: 0 });
}
function fechaCanarias(iso: string) {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "Atlantic/Canary" }); // YYYY-MM-DD
}

async function enviarVenta(ventaId: string) {
  const { data: v, error } = await admin.from("ventas").select("*").eq("id", ventaId).single();
  if (error || !v) return { error: "Venta no encontrada" };
  if (v.verifactu_estado && v.verifactu_estado !== "error") return { error: "Esta venta ya está registrada en Verifactu", venta: v };
  if (!v.num_ticket || !v.verifactu_id) {
    const { data: n, error: e2 } = await admin.rpc("asignar_numero_verifactu", { p_venta: ventaId });
    if (e2) return { error: "No se pudo numerar el ticket: " + e2.message };
    v.num_ticket = n.num_ticket; v.verifactu_id = n.verifactu_id;
  }
  const vatLines = lineasImpuesto(v.items);
  const fecha = fechaCanarias(v.created_at);
  const json_data = {
    id: { number: v.num_ticket, issuedTime: fecha },
    description: { text: "Venta en centro Divas Skin Care", operationDate: fecha },
    type: "F2",
    vatLines,
    total: r2(Number(v.total)),
    amount: r2(vatLines.reduce((a, l) => a + Number(l.amount || 0), 0)),
  };
  const r = await api("POST", { action: "send_invoice", id: v.verifactu_id, json_data });
  const d = r.j?.data || {};
  const ok = r.j?.success && d.queueId;
  const upd = ok
    ? { verifactu_estado: d.status || "pending", verifactu_queue_id: String(d.queueId), verifactu_qr: d.qrcode || null, verifactu_url: d.verifactuUrl || null, verifactu_at: new Date().toISOString(), verifactu_msg: null }
    : { verifactu_estado: "error", verifactu_msg: JSON.stringify(r.j).slice(0, 900), verifactu_at: new Date().toISOString() };
  await admin.from("ventas").update(upd).eq("id", ventaId);
  return { ok: !!ok, status: r.status, enviado: json_data, respuesta: ok ? { ...d, qrcode: d.qrcode ? "(qr recibido)" : null, verifactuJson: undefined } : r.j };
}

async function estado() {
  const { data: pend } = await admin.from("ventas").select("id,verifactu_queue_id").in("verifactu_estado", ["pending"]).not("verifactu_queue_id", "is", null).limit(20);
  if (!pend?.length) return { revisadas: 0 };
  const docs: Record<string, { queueId: string }> = {};
  pend.forEach((p, i) => { docs[String(i + 1)] = { queueId: p.verifactu_queue_id }; });
  const r = await api("POST", { action: "check_docs", docs });
  const res = r.j?.data?.docs || {};
  for (const [k, info] of Object.entries<any>(res)) {
    const p = pend[Number(k) - 1]; if (!p) continue;
    await admin.from("ventas").update({ verifactu_estado: info.state || "pending", verifactu_msg: info.message || null }).eq("id", p.id);
  }
  return { revisadas: pend.length, respuesta: res };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    // Solo usuarios del panel
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: u } = await admin.auth.getUser(jwt);
    if (!u?.user) return json({ error: "No autorizado" }, 401);
    if (ENDPOINT === "/" || !CID || !CSEC) return json({ error: "Faltan los secrets VERIFACTU_URL / VERIFACTU_CLIENT_ID / VERIFACTU_CLIENT_SECRET" }, 500);

    const body = await req.json().catch(() => ({}));
    switch (body.action) {
      case "resumen": return json(await resumen());
      case "enviar_venta": return json(await enviarVenta(body.venta_id));
      case "estado": return json(await estado());
      case "prueba_libre": {
        if (!entorno) await resumen();
        if (String(entorno).toLowerCase().indexOf("prueba") === -1) return json({ error: "prueba_libre solo en entorno de pruebas", entorno }, 403);
        const r = await api("POST", { action: "send_invoice", id: body.id, json_data: body.json_data });
        return json({ status: r.status, respuesta: { ...(r.j || {}), data: r.j?.data ? { ...r.j.data, qrcode: r.j.data.qrcode ? "(qr recibido)" : null, verifactuJson: undefined } : undefined } });
      }
      case "consultar": { // estado de queueIds concretos (pruebas)
        const docs: Record<string, { queueId: string }> = {};
        (body.queueIds || []).forEach((q: string, i: number) => { docs[String(i + 1)] = { queueId: String(q) }; });
        return json(await api("POST", { action: "check_docs", docs }));
      }
      default: return json({ error: "Acción desconocida" }, 400);
    }
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
