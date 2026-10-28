import { supabaseAdmin } from '@/lib/supabaseAdmin';
import VerifyBookForm from '@/components/VerifyBookForm';
import { verifyBook, rejectBook, correctAmazonLink } from './actions';

export const dynamic = 'force-dynamic';

async function getPendingBooks() {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from('books')
    .select(
      'id, title, author, isbn, isbn13, pages, cover_url, amazon_cover_url, amazon_title, amazon_author, amazon_isbn, synopsis, affiliate_url, manual_entry'
    )
    .is('confirmed', null)
    // Los que Amazon no encontró (o que esperan a que se lea su enlace manual) no salen aquí: viven en la
    // pestaña Amazon hasta que tengan datos de Amazon con los que comparar.
    .or('amazon_lookup_failed.eq.false,amazon_title.not.is.null')
    .order('id', { ascending: true });

  if (error) throw new Error(error.message);
  return data;
}

function Banner({ params }) {
  if (params.error) {
    return <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-900">{params.error}</p>;
  }
  if (params.linked) {
    return (
      <p className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 text-sm text-green-900">
        Enlace guardado. El libro sale de aquí hasta que lances el proceso en la pestaña Amazon: entonces leerá tu enlace
        y el libro volverá con su portada y sus datos.
      </p>
    );
  }
  return null;
}

export default async function PanelPage({ searchParams }) {
  const params = await searchParams;
  const books = await getPendingBooks();

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Libros pendientes de revisar</h1>
          <p className="text-sm text-slate-500">{books.length} pendientes</p>
        </div>
        <a href="/" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100">
          Actualizar
        </a>
      </div>

      <Banner params={params} />

      {books.length === 0 && (
        <p className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
          No hay libros pendientes ahora mismo.
        </p>
      )}

      <ul className="space-y-4">
        {books.map((book) => (
          <li key={book.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <VerifyBookForm book={book} verifyBook={verifyBook} />

            <details className="mt-3">
              <summary className="w-fit cursor-pointer list-none rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100">
                Corregir enlace de Amazon
              </summary>
              <form action={correctAmazonLink} className="mt-2 flex flex-col gap-2">
                <input type="hidden" name="bookId" value={book.id} />
                <p className="text-xs text-slate-500">
                  Si Amazon trae otro libro (el ISBN está mal), búscalo tú en Amazon y pega aquí tu enlace de afiliado.
                  El libro saldrá de esta lista hasta que lances el proceso en la pestaña Amazon, que leerá tu enlace.
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    name="affiliateUrl"
                    placeholder="https://www.amazon.es/dp/XXXXXXXXXX?tag=hugomino0a-21"
                    className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                  />
                  <button
                    type="submit"
                    className="flex-none rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
                  >
                    Guardar enlace
                  </button>
                </div>
              </form>
            </details>

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
