import { supabaseAdmin } from '@/lib/supabaseAdmin';
import IsbnCheck from '@/components/IsbnCheck';
import { requestEnrichRun, saveManualAffiliateLink, chooseCover } from './actions';
import { isRunningStale } from './stale';

export const dynamic = 'force-dynamic';

const STATUS_LABEL = {
  idle: 'En reposo',
  pending: 'Pendiente de ejecutar',
  running: 'Ejecutándose ahora',
};

async function getStatus() {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase.from('amazon_enrich_status').select('*').eq('id', 1).single();
  if (error) throw new Error(error.message);
  return data;
}

async function getFailedBooks() {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from('books')
    .select('id, title, author, isbn, isbn13, cover_url')
    .eq('amazon_lookup_failed', true)
    .is('affiliate_url', null)
    .order('id', { ascending: true });
  if (error) throw new Error(error.message);
  return data;
}

// Libros con enlace pegado a mano que aún no tienen datos de Amazon: esperan a que el proceso lea su enlace.
// Incluye los ya verificados: no vuelven a Verificación, pero tienen que seguir visibles hasta que se lea el enlace.
async function getWaitingBooks() {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from('books')
    .select('id, title, author, isbn, isbn13, cover_url, affiliate_url, confirmed')
    .eq('amazon_lookup_failed', true)
    .not('affiliate_url', 'is', null)
    .is('amazon_title', null)
    .order('id', { ascending: true });
  if (error) throw new Error(error.message);
  return data;
}

// Libros YA verificados cuyo enlace manual ya se ha leído: el admin decide si se queda la portada actual o la de Amazon.
// amazon_lookup_failed = true es la señal de "decisión pendiente"; al elegir (o al verificar) vuelve a false.
async function getCoverChoiceBooks() {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from('books')
    .select('id, title, author, isbn, isbn13, cover_url, amazon_title, amazon_author, amazon_cover_url, amazon_isbn')
    .eq('confirmed', true)
    .eq('amazon_lookup_failed', true)
    .not('amazon_title', 'is', null)
    .order('id', { ascending: true });
  if (error) throw new Error(error.message);
  return data;
}

function normalize(value) {
  return (value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function coverOrigin(url) {
  if (!url) return null;
  if (url.includes('openlibrary.org')) return 'Open Library';
  if (url.includes('/storage/v1/object/public/book-covers/')) return 'Subida por el usuario';
  if (url.includes('media-amazon.com')) return 'Amazon';
  return 'Otra fuente';
}

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('es-ES');
}

function Banner({ params }) {
  if (params.error) {
    return <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-900">{params.error}</p>;
  }
  const ok = 'mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 text-sm text-green-900';
  if (params.linked) {
    return <p className={ok}>Enlace guardado. Lanza el proceso para que lo lea y traiga la portada y los datos del libro.</p>;
  }
  if (params.linkedVerified) {
    return (
      <p className={ok}>
        Enlace guardado. «{params.linkedVerified}» ya estaba verificado, así que no pasa por Verificación. Lanza el
        proceso y, cuando lea el enlace, podrás elegir su portada (la actual o la de Amazon) en el bloque «Elegir
        portada» de más abajo.
      </p>
    );
  }
  if (params.covered) {
    return (
      <p className={ok}>
        {params.covered === 'amazon'
          ? `Portada de Amazon aplicada a «${params.coveredTitle}».`
          : `Se mantiene la portada actual de «${params.coveredTitle}».`}
      </p>
    );
  }
  return null;
}

function CoverChoiceCard({ book }) {
  const titleMismatch = normalize(book.title) !== normalize(book.amazon_title);
  const authorMismatch = Boolean(book.amazon_author) && normalize(book.author) !== normalize(book.amazon_author);
  const origin = coverOrigin(book.cover_url);

  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <form action={chooseCover} className="flex gap-4">
        <input type="hidden" name="bookId" value={book.id} />

        <div className="flex flex-none gap-2">
          <figure className="flex flex-col items-center gap-1">
            {book.cover_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={book.cover_url} alt="" className="h-32 w-24 rounded-md object-cover" />
            ) : (
              <div className="flex h-32 w-24 items-center justify-center rounded-md bg-slate-100 text-xs text-slate-400">
                Sin portada
              </div>
            )}
            <figcaption className="text-[10px] text-slate-500">Actual{origin ? ` · ${origin}` : ''}</figcaption>
          </figure>
          <figure className="flex flex-col items-center gap-1">
            {book.amazon_cover_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={book.amazon_cover_url} alt="" className="h-32 w-24 rounded-md object-cover" />
            ) : (
              <div className="flex h-32 w-24 items-center justify-center rounded-md bg-slate-100 text-xs text-slate-400">
                Sin portada
              </div>
            )}
            <figcaption className="text-[10px] text-slate-500">Amazon</figcaption>
          </figure>
        </div>

        <div className="min-w-0 flex-1">
          <p className="font-medium text-slate-900">{book.title}</p>
          <p className="text-sm text-slate-600">{book.author}</p>
          <p className={`mt-1 text-xs ${titleMismatch || authorMismatch ? 'text-red-600' : 'text-slate-500'}`}>
            Amazon: {book.amazon_title}
            {book.amazon_author ? ` — ${book.amazon_author}` : ''}
          </p>

          <IsbnCheck book={book} />

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="submit"
              name="choice"
              value="amazon"
              disabled={!book.amazon_cover_url}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              Usar la de Amazon
            </button>
            <button
              type="submit"
              name="choice"
              value="current"
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Mantener la actual
            </button>
          </div>
        </div>
      </form>
    </li>
  );
}

function BookCard({ book, linkValue, note }) {
  return (
    <li className="flex gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      {book.cover_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={book.cover_url} alt="" className="h-24 w-16 flex-none rounded-md object-cover" />
      ) : (
        <div className="flex h-24 w-16 flex-none items-center justify-center rounded-md bg-slate-100 text-[10px] text-slate-400">
          Sin portada
        </div>
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-slate-900">{book.title}</p>
        <p className="truncate text-sm text-slate-600">{book.author}</p>
        <p className="mt-0.5 text-xs text-slate-500">ISBN: {book.isbn13 || book.isbn || '—'}</p>
        <a
          href={`https://www.amazon.es/s?k=${encodeURIComponent(`${book.title} ${book.author || ''}`.trim())}`}
          target="_blank"
          rel="noreferrer"
          className="mt-0.5 inline-block text-xs text-blue-600 underline"
        >
          Buscar en Amazon.es
        </a>
        {note}

        <form action={saveManualAffiliateLink} className="mt-2 flex gap-2">
          <input type="hidden" name="bookId" value={book.id} />
          <input
            type="text"
            name="affiliateUrl"
            defaultValue={linkValue}
            placeholder="https://www.amazon.es/dp/XXXXXXXXXX?tag=hugomino0a-21"
            className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
          />
          <button
            type="submit"
            className="flex-none rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            Guardar
          </button>
        </form>
      </div>
    </li>
  );
}

export default async function AmazonPage({ searchParams }) {
  const params = await searchParams;
  const [status, failedBooks, waitingBooks, coverChoiceBooks] = await Promise.all([
    getStatus(),
    getFailedBooks(),
    getWaitingBooks(),
    getCoverChoiceBooks(),
  ]);
  const stale = isRunningStale(status);
  const canTrigger = status.status === 'idle' || stale;
  const failureByBook = Object.fromEntries(
    (Array.isArray(status.failure_details) ? status.failure_details : []).map((f) => [f.book_id, f.reason])
  );

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Enriquecimiento de Amazon</h1>
          <p className="text-sm text-slate-500">
            Busca por ISBN el enlace y la portada de los libros que aún no los tienen, y lee la ficha de los libros a los
            que has pegado un enlace a mano.
          </p>
        </div>
        <a href="/amazon" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100">
          Actualizar
        </a>
      </div>

      <Banner params={params} />

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-900">
              Estado: {STATUS_LABEL[status.status] || status.status}
              {stale && ' (parece atascado, puedes relanzarlo)'}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Al pulsar el botón, la tarea programada de tu PC lo recoge en un máximo de 5 min (el PC debe estar
              encendido). No se ejecuta nada por su cuenta si no hay una petición pendiente.
            </p>
          </div>
          <form action={requestEnrichRun}>
            <button
              type="submit"
              disabled={!canTrigger}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              Lanzar proceso
            </button>
          </form>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-slate-100 pt-4 text-sm">
          <div>
            <dt className="text-slate-500">Última petición</dt>
            <dd>{formatDate(status.requested_at)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Última ejecución iniciada</dt>
            <dd>{formatDate(status.started_at)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Última ejecución terminada</dt>
            <dd>{formatDate(status.finished_at)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Resultado</dt>
            <dd>
              {status.updated_count ?? 0} actualizados, {status.failed_count ?? 0} fallidos
            </dd>
          </div>
        </dl>

        {Array.isArray(status.failure_details) && status.failure_details.length > 0 && (
          <div className="mt-4 border-t border-slate-100 pt-4">
            <p className="text-sm font-medium text-slate-700">Fallos de la última ejecución</p>
            <ul className="mt-2 space-y-1 text-xs text-slate-500">
              {status.failure_details.map((f) => (
                <li key={f.book_id}>
                  #{f.book_id} "{f.title}": {f.reason}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="mt-8">
        <h2 className="text-lg font-semibold">Sin enlace de Amazon ({failedBooks.length})</h2>
        <p className="mt-1 text-sm text-slate-500">
          La búsqueda automática no encontró estos libros en Amazon.es (o no tienen ISBN) — quedan excluidos de
          futuras pasadas del script para no saturarlo. Busca el libro a mano y pega aquí el link de afiliado.
        </p>

        {failedBooks.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
            No hay ninguno pendiente de enlace manual ahora mismo.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {failedBooks.map((book) => (
              <BookCard key={book.id} book={book} />
            ))}
          </ul>
        )}
      </div>

      {coverChoiceBooks.length > 0 && (
        <div className="mt-10">
          <h2 className="text-lg font-semibold">Elegir portada ({coverChoiceBooks.length})</h2>
          <p className="mt-1 text-sm text-slate-500">
            Libros que ya estaban verificados y a los que has puesto tu enlace de Amazon. Elige si se queda la portada que
            tienen o la de Amazon en alta calidad. El título y el autor de Amazon salen en rojo si no coinciden.
          </p>
          <ul className="mt-4 space-y-3">
            {coverChoiceBooks.map((book) => (
              <CoverChoiceCard key={book.id} book={book} />
            ))}
          </ul>
        </div>
      )}

      <div className="mt-10">
        <h2 className="text-lg font-semibold">Con enlace guardado, esperando al proceso ({waitingBooks.length})</h2>
        <p className="mt-1 text-sm text-slate-500">
          Libros a los que has pegado tu enlace (porque Amazon no los encontraba o traía otro libro por un ISBN
          equivocado). Al lanzar el proceso se lee la ficha de tu enlace —portada en alta calidad, título y autor—. Los
          pendientes vuelven a Verificación para que los compares; los que ya estaban verificados pasan al bloque «Elegir
          portada». Si el enlace falla, el motivo aparece aquí y puedes corregirlo.
        </p>

        {waitingBooks.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
            No hay ningún libro esperando.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {waitingBooks.map((book) => (
              <BookCard
                key={book.id}
                book={book}
                linkValue={book.affiliate_url}
                note={
                  <>
                    {book.confirmed === true && (
                      <p className="mt-1 text-xs font-medium text-emerald-700">
                        Ya verificado: el proceso solo traerá la portada de Amazon para que elijas.
                      </p>
                    )}
                    {failureByBook[book.id] ? (
                      <p className="mt-1 text-xs text-red-600">Último intento: {failureByBook[book.id]}</p>
                    ) : (
                      <p className="mt-1 text-xs text-slate-500">Pendiente de lanzar el proceso.</p>
                    )}
                  </>
                }
              />
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
