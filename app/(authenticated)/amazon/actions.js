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
// Si el libro ya estaba verificado, el aviso lo dice: no pasa por Verificación, solo se le ofrecerá elegir portada.
export async function saveManualAffiliateLink(formData) {
  const bookId = Number(formData.get('bookId'));
  const result = await saveManualAmazonLink(bookId, formData.get('affiliateUrl'));
  if (result.error) redirect(`/amazon?${new URLSearchParams({ error: result.error })}`);

  revalidatePath('/amazon');
  revalidatePath('/');
  redirect(
    result.alreadyVerified ? `/amazon?${new URLSearchParams({ linkedVerified: result.title })}` : '/amazon?linked=1'
  );
}

// Libro ya verificado cuyo enlace manual se ha leído: el admin elige qué portada se queda.
//  - 'amazon':  la portada de Amazon pasa a ser la del libro (igual que al verificar eligiendo Amazon).
//  - 'current': se mantiene la que tiene.
// En ambos casos amazon_lookup_failed vuelve a false: es la señal de "ya decidido" que lo saca del bloque.
export async function chooseCover(formData) {
  const bookId = Number(formData.get('bookId'));
  const choice = formData.get('choice')?.toString();
  if (choice !== 'amazon' && choice !== 'current') redirect('/amazon');

  const supabase = supabaseAdmin();
  const { data: book, error: fetchError } = await supabase
    .from('books')
    .select('title, confirmed, amazon_cover_url')
    .eq('id', bookId)
    .single();
  if (fetchError) redirect(`/amazon?${new URLSearchParams({ error: fetchError.message })}`);

  const updates = { amazon_lookup_failed: false };
  if (choice === 'amazon') {
    if (!book.amazon_cover_url) redirect(`/amazon?${new URLSearchParams({ error: 'Este libro no tiene portada de Amazon.' })}`);
    updates.cover_url = book.amazon_cover_url;
    updates.cover_source = 'amazon';
  }

  const { error } = await supabase.from('books').update(updates).eq('id', bookId).eq('confirmed', true);
  if (error) redirect(`/amazon?${new URLSearchParams({ error: error.message })}`);

  revalidatePath('/amazon');
  redirect(`/amazon?${new URLSearchParams({ covered: choice, coveredTitle: book.title })}`);
}
