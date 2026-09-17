import { supabaseAdmin } from '@/lib/supabaseAdmin';
import VerifyBookForm from '@/components/VerifyBookForm';
import { verifyBook, rejectBook } from './actions';

export const dynamic = 'force-dynamic';

async function getPendingBooks() {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from('books')
    .select('id, title, author, isbn, isbn13, pages, cover_url, amazon_cover_url, synopsis, affiliate_url, manual_entry')
    .is('confirmed', null)
    .order('id', { ascending: true });

  if (error) throw new Error(error.message);
  return data;
}

export default async function PanelPage() {
  const books = await getPendingBooks();

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Libros pendientes de revisar</h1>
          <p className="text-sm text-slate-500">{books.length} pendientes</p>
        </div>
        <a href="/" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100">
          Actualizar
        </a>
      </div>

      {books.length === 0 && (
        <p className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
          No hay libros pendientes ahora mismo.
        </p>
      )}

      <ul className="space-y-4">
        {books.map((book) => (
          <li key={book.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <VerifyBookForm book={book} verifyBook={verifyBook} />

            <details className="group mt-3">
              <summary className="w-fit cursor-pointer list-none rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700">
                Rechazar
              </summary>
              <form action={rejectBook} className="mt-2 flex flex-col gap-2">
                <input type="hidden" name="bookId" value={book.id} />
                <textarea
                  name="notes"
                  placeholder="Motivo del rechazo (opcional)"
                  rows={2}
                  className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                />
                <button
                  type="submit"
                  className="self-start rounded-md border border-red-600 px-3 py-1 text-sm font-medium text-red-600 hover:bg-red-50"
                >
                  Confirmar rechazo
                </button>
              </form>
            </details>
          </li>
        ))}
      </ul>
    </main>
  );
}
