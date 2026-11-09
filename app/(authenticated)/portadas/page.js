import { supabaseAdmin } from '@/lib/supabaseAdmin';
import IsbnCheck from '@/components/IsbnCheck';
import ConfirmSubmitButton from '@/components/ConfirmSubmitButton';
import { coverOrigin } from '@/lib/coverOrigin';
import { manualCoverFilter } from '@/lib/manualCoverFilter';
import { reviewCover, confirmManualCovers } from './actions';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 30;
const COLUMNS =
  'id, title, author, isbn, isbn13, cover_url, cover_source, confirmation_method, confirmed, amazon_title, amazon_author, amazon_cover_url, amazon_isbn';
// Rechazados fuera: confirmed puede ser null (pendiente) o true (verificado).
const NOT_REJECTED = 'confirmed.is.null,confirmed.eq.true';

function normalize(value) {
  return (value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

async function countBooks(build) {
  const { count, error } = await build(supabaseAdmin().from('books').select('id', { count: 'exact', head: true }));
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function loadData() {
  const supabase = supabaseAdmin();

  // Sonda: si falta la columna de docs/sql/portadas.sql se avisa en vez de romper.
  const probe = await supabase.from('books').select('cover_confirmed_at').limit(1);
  if (probe.error) {
    const code = probe.error.code;
    if (code === '42703' || code === 'PGRST204' || code === 'PGRST205') return { needsSetup: true };
    throw new Error(probe.error.message);
  }

  const manualFilter = await manualCoverFilter(supabase);

  const [noCover, unconfirmed, noAuthorNull, noAuthorEmpty, total, confirmed, noCoverCount, unconfirmedCount, manualCount] =
    await Promise.all([
      supabase.from('books').select(COLUMNS).or(NOT_REJECTED).is('cover_url', null).order('id', { ascending: false }).limit(PAGE_SIZE),
      // Con portada y sin confirmar. Se traen todos (son pocos) para repartirlos por origen sin más consultas.
      supabase.from('books').select(COLUMNS).or(NOT_REJECTED).not('cover_url', 'is', null).is('cover_confirmed_at', null).order('id', { ascending: false }).limit(1000),
      // Portada ya confirmada pero sin autor: siguen saliendo hasta que se les escribe uno.
      supabase.from('books').select(COLUMNS).or(NOT_REJECTED).not('cover_confirmed_at', 'is', null).is('author', null).limit(PAGE_SIZE),
      supabase.from('books').select(COLUMNS).or(NOT_REJECTED).not('cover_confirmed_at', 'is', null).eq('author', '').limit(PAGE_SIZE),
      countBooks((q) => q.or(NOT_REJECTED)),
      countBooks((q) => q.or(NOT_REJECTED).not('cover_confirmed_at', 'is', null)),
      countBooks((q) => q.or(NOT_REJECTED).is('cover_url', null)),
      countBooks((q) => q.or(NOT_REJECTED).not('cover_url', 'is', null).is('cover_confirmed_at', null)),
      countBooks((q) => q.eq('confirmed', true).is('cover_confirmed_at', null).not('cover_url', 'is', null).or(manualFilter)),
    ]);
  for (const r of [noCover, unconfirmed, noAuthorNull, noAuthorEmpty]) {
    if (r.error) throw new Error(r.error.message);
  }

  const fromOpenLibrary = (b) => b.confirmation_method === 'auto_isbn_ol' || b.cover_source === 'open_library';
  const openLibrary = unconfirmed.data.filter(fromOpenLibrary);
  const others = unconfirmed.data.filter((b) => !fromOpenLibrary(b));
  const noAuthor = [...noAuthorNull.data, ...noAuthorEmpty.data].sort((a, b) => b.id - a.id);

  return {
    noCover: noCover.data,
    openLibrary,
    others,
    noAuthor,
    total,
    confirmed,
    noCoverCount,
    unconfirmedCount,
    manualCount,
  };
}

function Banner({ params }) {
  const ok = 'mt-4 rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 text-sm text-green-900';
  if (params.error) {
    return <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-900">{params.error}</p>;
  }
  if (params.saved) return <p className={ok}>«{params.saved}» guardado.</p>;
  if (params.bulk !== undefined) {
    return (
      <p className={ok}>
        {params.bulk} {params.bulk === '1' ? 'portada confirmada' : 'portadas confirmadas'}.
      </p>
    );
  }
  return null;
}

function Stat({ value, label }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}

function CoverCard({ book }) {
  const noAuthor = !book.author?.trim();
  const origin = coverOrigin(book);
  const hasCover = Boolean(book.cover_url);
  const hasAmazonCover = Boolean(book.amazon_cover_url);
  const authorMismatch = Boolean(book.amazon_author) && normalize(book.author) !== normalize(book.amazon_author);

  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <form action={reviewCover} className="flex gap-4">
        <input type="hidden" name="bookId" value={book.id} />

        <div className="flex flex-none gap-2">
          <figure className="flex flex-col items-center gap-1">
            {hasCover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={book.cover_url} alt="" className="h-32 w-24 rounded-md object-cover" />
            ) : (
              <div className="flex h-32 w-24 items-center justify-center rounded-md bg-slate-100 text-xs text-slate-400">
                Sin portada
              </div>
            )}
            <figcaption className="max-w-24 text-center text-[10px] text-slate-500">Actual{origin ? ` · ${origin}` : ''}</figcaption>
          </figure>
          <figure className="flex flex-col items-center gap-1">
            {hasAmazonCover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={book.amazon_cover_url} alt="" className="h-32 w-24 rounded-md object-cover" />
            ) : (
              <div className="flex h-32 w-24 items-center justify-center rounded-md bg-slate-100 text-xs text-slate-400">
                Sin Amazon
              </div>
            )}
            <figcaption className="text-[10px] text-slate-500">Amazon</figcaption>
          </figure>
        </div>

        <div className="min-w-0 flex-1">
          <p className="font-medium text-slate-900">
            {book.title}
            {book.confirmed !== true && (
              <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 align-middle text-[10px] font-semibold text-amber-800">
                SIN VERIFICAR
              </span>
            )}
          </p>
          <input
            type="text"
            name="author"
            defaultValue={book.author || ''}
            required={noAuthor}
            placeholder="Autor"
            className={`mt-1 w-full rounded-md border px-2 py-1 text-sm ${
              noAuthor ? 'border-red-400 bg-red-50' : authorMismatch ? 'border-red-300' : 'border-slate-200'
            }`}
          />
          {noAuthor && <p className="mt-0.5 text-xs text-red-600">Este libro no tiene autor.</p>}
          {book.amazon_author && (
            <p className={`mt-0.5 text-xs ${authorMismatch ? 'text-red-600' : 'text-slate-500'}`}>
              Amazon: {book.amazon_author.replace(/\s*\n\s*/g, ' ')}
            </p>
          )}

          <IsbnCheck book={book} />

          {!hasCover && !hasAmazonCover && (
            <p className="mt-2 text-xs text-slate-500">
              Ni el libro ni Amazon tienen portada.{' '}
              <a
                href={`https://www.amazon.es/s?k=${encodeURIComponent(`${book.title} ${book.author || ''}`.trim())}`}
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 underline"
              >
                Buscar en Amazon.es
              </a>{' '}
              y pega su enlace en la pestaña Amazon para que el proceso traiga la portada.
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            {hasAmazonCover && (
              <button
                type="submit"
                name="choice"
                value="amazon"
                className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
              >
                Usar la de Amazon
              </button>
            )}
            {hasCover && (
              <button
                type="submit"
                name="choice"
                value="current"
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                {hasAmazonCover ? 'Dejar la actual' : 'Confirmar portada'}
              </button>
            )}
          </div>
        </div>
      </form>
    </li>
  );
}

function Section({ title, description, books, total }) {
  if (books.length === 0) return null;
  const shown = books.slice(0, PAGE_SIZE);
  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold">
        {title} ({total ?? books.length})
      </h2>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
      <ul className="mt-4 space-y-3">
        {shown.map((book) => (
          <CoverCard key={book.id} book={book} />
        ))}
      </ul>
      {(total ?? books.length) > shown.length && (
        <p className="mt-3 text-xs text-slate-500">
          Se muestran {shown.length} de {total ?? books.length}. Al guardar uno, entra el siguiente.
        </p>
      )}
    </section>
  );
}

export default async function CoversPage({ searchParams }) {
  const params = await searchParams;
  const data = await loadData();

  if (data.needsSetup) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-xl font-semibold">Portadas</h1>
        <div className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900">
          <p className="font-medium">Falta un paso en la base de datos</p>
          <p className="mt-1">
            Ejecuta una vez el contenido de <code>docs/sql/portadas.sql</code> en el SQL Editor de Supabase y recarga
            esta página.
          </p>
        </div>
      </main>
    );
  }

  const { noCover, openLibrary, others, noAuthor } = data;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Portadas</h1>
          <p className="text-sm text-slate-500">
            Revisa la portada de los libros: la actual (la que dio el usuario o Open Library) frente a la de Amazon en alta
            calidad. Una vez confirmada, el libro sale de la lista.
          </p>
        </div>
        <a href="/portadas" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100">
          Actualizar
        </a>
      </div>

      <Banner params={params} />

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat value={`${data.confirmed} de ${data.total}`} label="portadas confirmadas" />
        <Stat value={data.unconfirmedCount} label="con portada, sin confirmar" />
        <Stat value={data.noCoverCount} label="sin portada" />
        <Stat value={noAuthor.length} label="sin autor (portada confirmada)" />
      </div>

      {data.manualCount > 0 && (
        <section className="mt-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Dar por buenas las que verificaste tú</h2>
          <p className="mt-1 text-sm text-slate-500">
            {data.manualCount} {data.manualCount === 1 ? 'libro' : 'libros'} que verificaste a mano en el panel (o cuya
            portada ya elegiste en la pestaña Amazon). Se marca su portada como confirmada y salen de las listas de abajo.
            No cambia ninguna imagen.
          </p>
          <form action={confirmManualCovers} className="mt-4">
            <ConfirmSubmitButton
              confirmText={`Se darán por buenas las portadas de ${data.manualCount} libros que verificaste tú. No cambia ninguna imagen. ¿Continuar?`}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
            >
              Confirmar las portadas de estos {data.manualCount}
            </ConfirmSubmitButton>
          </form>
        </section>
      )}

      <Section
        title="Sin portada"
        description="Libros sin imagen. Si Amazon tiene una, úsala; si no, busca el libro en Amazon y pega su enlace en la pestaña Amazon."
        books={noCover}
        total={data.noCoverCount}
      />

      <Section
        title="De Open Library, sin confirmar"
        description="Libros que los usuarios dan de alta con ISBN, título, autor y portada: se verifican solos y nunca pasan por Verificación. Compara su portada con la de Amazon y elige."
        books={openLibrary}
      />

      <Section
        title="Otros, sin confirmar"
        description="Libros con portada que aún no has revisado y que no vienen de Open Library."
        books={others}
      />

      <Section
        title="Sin autor"
        description="Su portada ya está confirmada, pero no tienen autor. Escríbelo y guarda."
        books={noAuthor}
      />

      {data.unconfirmedCount === 0 && data.noCoverCount === 0 && noAuthor.length === 0 && (
        <p className="mt-10 rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
          Todas las portadas están confirmadas.
        </p>
      )}
    </main>
  );
}
