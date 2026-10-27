'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { saveManualAmazonLink } from '@/lib/amazonLink';
import { STALE_RUNNING_MS } from './stale';

export async function requestEnrichRun() {
  const supabase = supabaseAdmin();

  // Solo pasa a 'pending' si estaba 'idle' o 'running' caducado — evita
  // encolar dos veces si se pulsa el botón varias veces seguidas mientras ya
  // hay algo pendiente o corriendo.
  const staleBefore = new Date(Date.now() - STALE_RUNNING_MS).toISOString();
  const { error } = await supabase
    .from('amazon_enrich_status')
    .update({ status: 'pending', requested_at: new Date().toISOString() })
    .eq('id', 1)
    .or(`status.eq.idle,and(status.eq.running,started_at.lt.${staleBefore})`);

  if (error) throw new Error(error.message);
  // Si no afectó ninguna fila es que ya estaba pending/running (carrera de
  // doble clic) — no pasa nada, simplemente no se vuelve a encolar.

  revalidatePath('/amazon');
}

// Enlace de Amazon pegado a mano. Deja el libro esperando al proceso, que leerá el enlace en vez de buscar por ISBN.
export async function saveManualAffiliateLink(formData) {
  const bookId = Number(formData.get('bookId'));
  const result = await saveManualAmazonLink(bookId, formData.get('affiliateUrl'));
  if (result.error) redirect(`/amazon?${new URLSearchParams({ error: result.error })}`);

  revalidatePath('/amazon');
  revalidatePath('/');
  redirect('/amazon?linked=1');
}
