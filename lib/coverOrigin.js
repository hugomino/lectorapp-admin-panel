// De dónde viene la portada actual de un libro, para enseñarlo junto a la imagen.
// cover_source manda; las portadas se re-alojan en Supabase Storage, así que la URL sola no dice el origen.
// Los libros que se verifican solos (confirmation_method = 'auto_isbn_ol') traen la portada de Open Library.
export function coverOrigin(book) {
  const url = book.cover_url;
  if (!url) return null;
  if (book.cover_source === 'open_library') return 'Open Library';
  if (book.cover_source === 'amazon') return 'Amazon';
  if (book.cover_source === 'user_upload') return 'Subida por el usuario';
  if (url.includes('openlibrary.org')) return 'Open Library';
  if (book.confirmation_method === 'auto_isbn_ol') return 'Open Library (alta automática)';
  if (url.includes('/storage/v1/object/public/book-covers/')) return 'Subida por el usuario';
  if (url.includes('media-amazon.com')) return 'Amazon';
  return 'Otra fuente';
}
