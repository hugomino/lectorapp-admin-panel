'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

function adminUserId() {
  return process.env.ADMIN_USER_ID || null;
}

export async function verifyBook(bookId) {
  const supabase = supabaseAdmin();

  const { error: updateError } = await supabase
    .from('books')
    .update({
      confirmed: true,
      confirmed_at: new Date().toISOString(),
      confirmation_method: 'manual_admin',
    })
    .eq('id', bookId);
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
