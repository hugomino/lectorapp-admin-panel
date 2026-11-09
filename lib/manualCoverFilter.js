// Filtro (sintaxis de .or() de PostgREST) de los libros cuya portada se da por buena de golpe en la pestaña Portadas:
// los que verificaste tú a mano en el panel (confirmation_method = 'manual_admin') y los que ya revisaste con el bloque
// anterior de la pestaña Amazon (book_review_log 'cover_reviewed').
export async function manualCoverFilter(supabase) {
  const { data, error } = await supabase.from('book_review_log').select('book_id').eq('event_type', 'cover_reviewed');
  if (error) throw new Error(error.message);
  const reviewedIds = [...new Set(data.map((r) => r.book_id))];
  return reviewedIds.length > 0
    ? `confirmation_method.eq.manual_admin,id.in.(${reviewedIds.join(',')})`
    : 'confirmation_method.eq.manual_admin';
}
