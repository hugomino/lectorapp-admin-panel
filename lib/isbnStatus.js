import { toIsbn13 } from '../scripts/amazon-enrich/isbn';

// Compara el ISBN de la base con el que el proceso leyó en la ficha de Amazon (books.amazon_isbn).
// null = Amazon no dio ISBN (p. ej. un ebook), no hay nada que comparar.
export function isbnStatus(book) {
  if (!book.amazon_isbn) return null;
  const own = book.isbn13 || book.isbn || null;
  return { own, amazon: book.amazon_isbn, match: toIsbn13(own) === book.amazon_isbn };
}
