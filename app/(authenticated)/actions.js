'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

function adminUserId() {
  return process.env.ADMIN_USER_ID || null;
}

export async function verifyBook(formData) {
  const bookId = Number(formData.get('bookId'));
  const coverChoice = formData.get('coverChoice'); // 'own' | 'amazon' | null (sin portada de Amazon aún)
  const supabase = supabaseAdmin();

  const { data: book, error: fetchError } = await supabase
    .from('books')
    .select('amazon_cover_url')
    .eq('id', bookId)
    .single();
  if (fetchError) throw new Error(fetchError.message);

  // Si hay portada de Amazon, elegir una de las dos es obligatorio — esto
  // repite en el servidor la validación del cliente por si acaso.
  if (book?.amazon_cover_url && coverChoice !== 'own' && coverChoice !== 'amazon') {
    throw new Error('Elige qué portada usar antes de verificar.');
  }

  const updates = {
    confirmed: true,
    confirmed_at: new Date().toISOString(),
    confirmation_method: 'manual_admin',
  };

  if (coverChoice === 'amazon' && book?.amazon_cover_url) {
    updates.cover_url = book.amazon_cover_url;
    updates.cover_source = 'amazon';
  }

  const { error: updateError } = await supabase.from('books').update(updates).eq('id', bookId);
  if (updateError) throw new Error(updateError.message);

  const { error: logError } = await supabase.from('book_review_log').insert({
    book_id: bookId,
    event_type: 'verified',
    processed_by: adminUserId(),
  });
  if (logError) throw new Error(logError.message);

  revalidatePath('/');
}

export async function rejectBook(formData) {
  const bookId = Number(formData.get('bookId'));
  const notes = formData.get('notes')?.toString().trim() || null;
  const supabase = supabaseAdmin();

  const { error: updateError } = await supabase
    .from('books')
    .update({
      confirmed: false,
      confirmed_at: new Date().toISOString(),
      confirmation_method: 'manual_admin',
      review_notes: notes,
    })
    .eq('id', bookId);
  if (updateError) throw new Error(updateError.message);

  const { error: logError } = await supabase.from('book_review_log').insert({
    book_id: bookId,
    event_type: 'rejected',
    notes,
    processed_by: adminUserId(),
  });
  if (logError) throw new Error(logError.message);

  revalidatePath('/');
}
