// Envía el correo "¡LectorApp ya está en iPhone!" a todos los de public.ios_waitlist que aún no lo han recibido.
// Lo lanza el botón de la pestaña "Usuarios iOS" del panel de administración, que le pasa el enlace de la App Store.
//
// Seguridad: solo acepta llamadas con la clave de servicio (service_role) del proyecto, que solo tiene el panel.
// Es idempotente: primero "reserva" a cada persona (notified_at = now()) y, si el envío falla, la libera.
//
// Secretos (Supabase → Edge Functions → Secrets):
//   RESEND_API_KEY   (obligatorio)  el mismo que usa send-tester-invites
//   INVITE_FROM      (opcional)     remitente (por defecto  LectorApp <no-reply@lectorapp.es>)
import { createClient } from "jsr:@supabase/supabase-js@2";
import { renderLaunch } from "./template.js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM = Deno.env.get("INVITE_FROM") ?? "LectorApp <no-reply@lectorapp.es>";
const SITE = "https://www.lectorapp.es";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

type Mail = { from: string; to: string[]; subject: string; html: string; text: string };

// Rol del JWT de la petición (la firma ya está verificada por el gateway porque verify_jwt = true).
function roleOf(req: Request): string {
  try {
    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return String(payload.role ?? "");
  } catch {
    return "";
  }
}

// Solo se aceptan enlaces de la App Store, para que ningún valor raro acabe en un correo masivo.
const validAppUrl = (u: unknown): u is string => typeof u === "string" && /^https:\/\/apps\.apple\.com\/\S+$/.test(u.trim());

const buildMail = (email: string, lang: string | null, appUrl: string, prefix = ""): Mail => {
  const { subject, html, text } = renderLaunch({ lang: lang === "en" ? "en" : "es", appUrl, siteUrl: SITE });
  return { from: FROM, to: [email], subject: prefix + subject, html, text };
};

async function resend(path: string, payload: unknown) {
  const r = await fetch(`https://api.resend.com${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data };
}

async function sendAll(appUrl: string) {
  const { count } = await sb.from("ios_waitlist").select("email", { count: "exact", head: true }).is("notified_at", null);
  if (!count) return json({ ok: true, enviados: 0, fallidos: [] });
  if (!RESEND_KEY) return json({ ok: false, error: "Falta el secreto RESEND_API_KEY en Supabase (Edge Functions → Secrets).", pendientes: count }, 500);

  // Reserva atómica: solo una ejecución se queda con cada fila, así nadie recibe el correo dos veces.
  const { data: claimed, error } = await sb.from("ios_waitlist")
    .update({ notified_at: new Date().toISOString() })
    .is("notified_at", null).select("email, lang");
  if (error) return json({ ok: false, error: error.message }, 500);
  if (!claimed?.length) return json({ ok: true, enviados: 0, fallidos: [] });

  const failed: { email: string; motivo: string }[] = [];
  let sent = 0;
  for (let i = 0; i < claimed.length; i += 50) {
    const chunk = claimed.slice(i, i + 50);
    const mails = chunk.map((r) => buildMail(r.email, r.lang, appUrl));
    const batch = await resend("/emails/batch", mails);
    if (batch.ok) { sent += chunk.length; continue; }
    // Si el lote falla (p. ej. una dirección no válida), se reintenta una a una para aislar el problema.
    for (const m of mails) {
      const one = await resend("/emails", m);
      if (one.ok) sent++;
      else failed.push({ email: m.to[0], motivo: (one.data as { message?: string })?.message ?? `HTTP ${one.status}` });
      await new Promise((r) => setTimeout(r, 600));
    }
  }
  if (failed.length) await sb.from("ios_waitlist").update({ notified_at: null }).in("email", failed.map((f) => f.email));
  return json({ ok: failed.length === 0, enviados: sent, fallidos: failed });
}

async function sendTest(body: { to?: string; lang?: string; appUrl?: string }, appUrl: string) {
  if (!body.to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.to)) return json({ ok: false, error: "Correo no válido" }, 400);
  if (!RESEND_KEY) return json({ ok: false, error: "Falta el secreto RESEND_API_KEY en Supabase (Edge Functions → Secrets)." }, 500);
  const r = await resend("/emails", buildMail(body.to, body.lang ?? "es", appUrl, "[PRUEBA] "));
  return r.ok ? json({ ok: true }) : json({ ok: false, error: (r.data as { message?: string })?.message ?? `HTTP ${r.status}` }, 502);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "Usa POST" }, 405);
  if (roleOf(req) !== "service_role") return json({ ok: false, error: "No autorizado" }, 403);
  const body = await req.json().catch(() => ({}));
  if (!validAppUrl(body?.appUrl)) {
    return json({ ok: false, error: "Falta el enlace de la App Store (debe empezar por https://apps.apple.com/)." }, 400);
  }
  const appUrl = body.appUrl.trim();
  try {
    return body.action === "test" ? await sendTest(body, appUrl) : await sendAll(appUrl);
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
