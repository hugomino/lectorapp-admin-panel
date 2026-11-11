'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { manualCoverFilter } from '@/lib/manualCoverFilter';
import { saveManualAmazonLink } from '@/lib/amazonLink';

function fail(error) {
  redirect(`/portadas?${new URLSearchParams({ error })}`);
}

// Da por buena la portada de un libro (y, de paso, deja escrito su autor). Sirve para cualquier libro, esté verificado
// o no:
//  - 'amazon':  la portada de Amazon pasa a ser la del libro (igual que al verificar eligiendo Amazon).
//  - 'current': se mantiene la que tiene.
// En ambos casos se anota cover_confirmed_at, que es lo que saca el libro de la lista. No se toca `confirmed`.
export async function reviewCover(formData) {
  const bookId = Number(formData.get('bookId'));
  const choice = formData.get('choice')?.toString();
  const author = formData.get('author')?.toString().trim() || '';
  if (choice !== 'amazon' && choice !== 'current') redirect('/portadas');

  const supabase = supabaseAdmin();
  const { data: book, error: fetchError } = await supabase
    .from('books')
    .select('title, author, confirmed, cover_url, amazon_cover_url')
    .eq('id', bookId)
    .single();
  if (fetchError) fail(fetchError.message);
  if (book.confirmed === false) fail('Este libro está rechazado.');
  if (!author && !book.author?.trim()) fail(`«${book.title}» no tiene autor: escríbelo antes de guardar.`);
  if (choice === 'amazon' && !book.amazon_cover_url) fail('Este libro no tiene portada de Amazon.');
  if (choice === 'current' && !book.cover_url) fail('Este libro no tiene portada actual: usa la de Amazon.');

  const updates = { cover_confirmed_at: new Date().toISOString() };
  if (author && author !== book.author) updates.author = author;
  if (choice === 'amazon') {
    updates.cover_url = book.amazon_cover_url;
    updates.cover_source = 'amazon';
  }

  const { error } = await supabase.from('books').update(updates).eq('id', bookId);
  if (error) fail(error.message);

  revalidatePath('/portadas');
  redirect(`/portadas?${new URLSearchParams({ saved: book.title })}`);
}

// El ISBN del libro está mal y Amazon trae otro libro: el admin busca el correcto y pega su enlace de afiliado.
// Se borran los datos de Amazon anteriores y el libro espera al proceso (pestaña Amazon), que lee el enlace.
export async function changeAmazonLink(formData) {
  const bookId = Number(formData.get('bookId'));
  const result = await saveManualAmazonLink(bookId, formData.get('affiliateUrl'));
  if (result.error) fail(result.error);

  revalidatePath('/portadas');
  revalidatePath('/amazon');
  revalidatePath('/');
  redirect(`/portadas?${new URLSearchParams({ linked: result.title })}`);
}

// Una sola vez: da por buenas las portadas de los libros que ya verificaste tú a mano. Repetirlo no hace daño
// (solo toca los que aún no estaban confirmados).
export async function confirmManualCovers() {
  const supabase = supabaseAdmin();
  const filter = await manualCoverFilter(supabase);

  const { data, error } = await supabase
    .from('books')
    .update({ cover_confirmed_at: new Date().toISOString() })
    .eq('confirmed', true)
    .is('cover_confirmed_at', null)
    .not('cover_url', 'is', null)
    .or(filter)
    .select('id');
  if (error) fail(error.message);

  revalidatePath('/portadas');
  redirect(`/portadas?${new URLSearchParams({ bulk: String(data?.length ?? 0) })}`);
}
