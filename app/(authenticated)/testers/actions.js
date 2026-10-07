'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const TABLE = 'beta_testers_android';
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Redirige a /testers con un aviso (ok / error) que la página muestra arriba.
function back(params) {
  const qs = new URLSearchParams(params).toString();
  redirect(qs ? `/testers?${qs}` : '/testers');
}

// Paso 1: marcar como aprobados (ya añadidos en Play Console) a los correos seleccionados.
// Solo toca filas que aún no estaban aprobadas, así que repetir el envío del formulario no hace daño.
export async function approveTesters(formData) {
  const emails = formData.getAll('email').map((e) => e.toString()).filter(Boolean);
  if (emails.length === 0) back({ error: 'No has seleccionado ningún correo.' });

  const { data, error } = await supabaseAdmin()
    .from(TABLE)
    .update({ is_tester_added: true, approved_at: new Date().toISOString() })
    .in('email', emails)
    .eq('is_tester_added', false)
    .select('email');
  if (error) back({ error: error.message });

  revalidatePath('/testers');
  back({ approved: String(data?.length ?? 0) });
}

// Deshacer una aprobación (por si se aprobó por error y todavía no se ha enviado el correo).
export async function unapproveTester(formData) {
  const email = formData.get('actionEmail')?.toString();
  if (!email) return;

  const { error } = await supabaseAdmin()
    .from(TABLE)
    .update({ is_tester_added: false, approved_at: null })
    .eq('email', email)
    .eq('welcome_email_sent', false);
  if (error) back({ error: error.message });

  revalidatePath('/testers');
  back();
}

// Borra a una persona de la lista (por ejemplo, si pide que se elimine su correo).
export async function removeTester(formData) {
  const email = formData.get('actionEmail')?.toString();
  if (!email) return;

  const { error } = await supabaseAdmin().from(TABLE).delete().eq('email', email);
  if (error) back({ error: error.message });

  revalidatePath('/testers');
  back({ removed: '1' });
}

// Llama a la función de Supabase que envía los correos. Solo el panel puede llamarla (clave de servicio).
async function callInviteFunction(payload) {
  const url = `${process.env.SUPABASE_URL}/functions/v1/send-tester-invites`;
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

// Paso 2: enviar el correo de bienvenida (con el botón de Google Play) a todos los aprobados que aún no lo han recibido.
export async function sendInvites() {
  const result = await callInviteFunction({ action: 'send' });
  revalidatePath('/testers');

  if (result.error) back({ error: result.error });
  if (result.fallidos?.length) {
    const detail = result.fallidos.map((f) => `${f.email}: ${f.motivo}`).join(' · ');
    back({ sent: String(result.enviados ?? 0), error: `No se pudo enviar a ${result.fallidos.length}: ${detail}` });
  }
  back({ sent: String(result.enviados ?? 0) });
}

// Envía el mismo correo a una dirección cualquiera para ver cómo llega. No toca la lista.
export async function sendTestEmail(formData) {
  const to = formData.get('to')?.toString().trim();
  const lang = formData.get('lang')?.toString() === 'en' ? 'en' : 'es';
  if (!to || !EMAIL_RE.test(to)) back({ error: 'Escribe un correo válido para la prueba.' });

  const result = await callInviteFunction({ action: 'test', to, lang });
  if (!result.ok) back({ error: result.error || 'No se pudo enviar la prueba.' });
  back({ test: to });
}
