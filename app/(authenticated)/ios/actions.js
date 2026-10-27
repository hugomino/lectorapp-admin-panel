'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const TABLE = 'ios_waitlist';
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const APP_STORE_RE = /^https:\/\/apps\.apple\.com\/\S+$/;

// Redirige a /ios con un aviso (ok / error) que la página muestra arriba.
function back(params) {
  const qs = new URLSearchParams(params).toString();
  redirect(qs ? `/ios?${qs}` : '/ios');
}

// Borra a una persona de la lista (por ejemplo, si pide que se elimine su correo).
export async function removeIosUser(formData) {
  const email = formData.get('actionEmail')?.toString();
  if (!email) return;

  const { error } = await supabaseAdmin().from(TABLE).delete().eq('email', email);
  if (error) back({ error: error.message });

  revalidatePath('/ios');
  back({ removed: '1' });
}

// Llama a la función de Supabase que envía los correos. Solo el panel puede llamarla (clave de servicio).
async function callLaunchFunction(payload) {
  const url = `${process.env.SUPABASE_URL}/functions/v1/send-ios-launch`;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });
  } catch (e) {
    return { ok: false, error: `No se pudo conectar con Supabase: ${e.message}` };
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok && !data.error) data.error = `Error ${res.status}`;
  return data;
}

function readAppUrl(formData) {
  const appUrl = formData.get('appUrl')?.toString().trim();
  if (!appUrl || !APP_STORE_RE.test(appUrl)) {
    back({ error: 'Pega el enlace de LectorApp en la App Store (empieza por https://apps.apple.com/).' });
  }
  return appUrl;
}

// Avisa a todos los que aún no han recibido el correo de que LectorApp ya está en la App Store.
export async function notifyAll(formData) {
  const appUrl = readAppUrl(formData);

  const result = await callLaunchFunction({ action: 'send', appUrl });
  revalidatePath('/ios');

  if (result.error) back({ error: result.error });
  if (result.fallidos?.length) {
    const detail = result.fallidos.map((f) => `${f.email}: ${f.motivo}`).join(' · ');
    back({ sent: String(result.enviados ?? 0), error: `No se pudo enviar a ${result.fallidos.length}: ${detail}` });
  }
  back({ sent: String(result.enviados ?? 0) });
}

// Envía el mismo correo a una dirección cualquiera para ver cómo llega. No toca la lista.
export async function sendIosTestEmail(formData) {
  const appUrl = readAppUrl(formData);
  const to = formData.get('to')?.toString().trim();
  const lang = formData.get('lang')?.toString() === 'en' ? 'en' : 'es';
  if (!to || !EMAIL_RE.test(to)) back({ error: 'Escribe un correo válido para la prueba.' });

  const result = await callLaunchFunction({ action: 'test', to, lang, appUrl });
  if (!result.ok) back({ error: result.error || 'No se pudo enviar la prueba.' });
  back({ test: to });
}
