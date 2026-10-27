'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { saveManualAmazonLink } from '@/lib/amazonLink';

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

  const title = formData.get('title')?.toString().trim();
  const author = formData.get('author')?.toString().trim();
  if (title) updates.title = title;
  if (author) updates.author = author;

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

// El ISBN del libro está mal y Amazon trae otro libro: el admin busca el correcto y pega su enlace de afiliado.
// El libro sale de Verificación hasta que el proceso (pestaña Amazon) lea el enlace y traiga sus datos.
export async function correctAmazonLink(formData) {
  const bookId = Number(formData.get('bookId'));
  const result = await saveManualAmazonLink(bookId, formData.get('affiliateUrl'));
  if (result.error) redirect(`/?${new URLSearchParams({ error: result.error })}`);

  revalidatePath('/');
  revalidatePath('/amazon');
  redirect('/?linked=1');
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
