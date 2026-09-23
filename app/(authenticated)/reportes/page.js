import { supabaseAdmin } from '@/lib/supabaseAdmin';
import {
  URGENCY_LEVELS,
  URGENCY_LABEL,
  suggestContentUrgency,
  suggestFeedbackUrgency,
  effectiveUrgency,
} from '@/lib/reportUrgency';
import { setReportStatus, setReportUrgency } from './actions';

export const dynamic = 'force-dynamic';

const REASON_LABEL = {
  explicit: 'Contenido explícito',
  incorrect: 'Información incorrecta',
  spam: 'Spam',
  other: 'Otro',
};

const STATUS_LABEL = { pending: 'Pendiente', reviewed: 'Resuelto', dismissed: 'Descartado' };

// Clases completas y literales para que Tailwind las detecte.
const URGENCY_STYLE = {
  green: { dot: 'bg-green-500', chip: 'bg-green-50 text-green-800 border-green-200' },
  yellow: { dot: 'bg-yellow-400', chip: 'bg-yellow-50 text-yellow-800 border-yellow-200' },
  orange: { dot: 'bg-orange-500', chip: 'bg-orange-50 text-orange-800 border-orange-200' },
  red: { dot: 'bg-red-600', chip: 'bg-red-50 text-red-800 border-red-200' },
  black: { dot: 'bg-slate-950', chip: 'bg-slate-900 text-white border-slate-900' },
};

const FEEDBACK_BUCKET = 'feedback-images';

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('es-ES');
}

function sortByUrgency(items) {
  return items.sort((a, b) => {
    const pendingDiff = Number(b.status === 'pending') - Number(a.status === 'pending');
    if (pendingDiff) return pendingDiff;
    const urgencyDiff = URGENCY_LEVELS.indexOf(b.urgencyEffective) - URGENCY_LEVELS.indexOf(a.urgencyEffective);
    if (urgencyDiff) return urgencyDiff;
    return new Date(b.created_at) - new Date(a.created_at);
  });
}

async function getUsernames(supabase, ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return {};
  const { data } = await supabase.from('profiles').select('id, username').in('id', unique);
  return Object.fromEntries((data || []).map((p) => [p.id, p.username]));
}

async function loadReports() {
  const supabase = supabaseAdmin();

  // Sonda: si faltan las columnas de docs/sql/reportes.sql, Postgres responde
  // 42703 (undefined_column) aunque las tablas estén vacías.
  const probes = await Promise.all([
    supabase.from('content_reports').select('id, urgency, status, reviewed_at').limit(1),
    supabase.from('feedback_reports').select('id, urgency, status, reviewed_at').limit(1),
  ]);
  if (probes.some((p) => p.error?.code === '42703')) return { needsSetup: true };
  for (const p of probes) if (p.error) throw new Error(p.error.message);

  const [contentRes, feedbackRes] = await Promise.all([
    supabase.from('content_reports').select('*').order('created_at', { ascending: false }).limit(500),
    supabase.from('feedback_reports').select('*').order('created_at', { ascending: false }).limit(500),
  ]);
  if (contentRes.error) throw new Error(contentRes.error.message);
  if (feedbackRes.error) throw new Error(feedbackRes.error.message);

  const content = contentRes.data;
  const feedback = feedbackRes.data;

  // Reportes pendientes por contenido, para escalar la urgencia.
  const pendingPerContent = {};
  for (const r of content) {
    if (r.status !== 'pending') continue;
    const key = `${r.content_type}:${r.content_id}`;
    pendingPerContent[key] = (pendingPerContent[key] || 0) + 1;
  }

  const bookIds = [
    ...new Set(content.filter((r) => r.content_type === 'book').map((r) => Number(r.content_id))),
  ].filter(Number.isFinite);
  const { data: books } = bookIds.length
    ? await supabase.from('books').select('id, title, author, isbn, isbn13, cover_url').in('id', bookIds)
    : { data: [] };
  const booksById = Object.fromEntries((books || []).map((b) => [b.id, b]));

  const usernames = await getUsernames(supabase, [
    ...content.map((r) => r.reporter_user_id),
    ...feedback.map((r) => r.user_id),
  ]);

  // Bucket privado: image_url guarda la ruta, hay que firmar una URL temporal.
  const paths = feedback.map((r) => r.image_url).filter(Boolean);
  const signedByPath = {};
  if (paths.length) {
    const { data: signed } = await supabase.storage.from(FEEDBACK_BUCKET).createSignedUrls(paths, 3600);
    for (const s of signed || []) if (s.signedUrl) signedByPath[s.path] = s.signedUrl;
  }

  const contentItems = content.map((r) => {
    const suggested = suggestContentUrgency(r.reason, pendingPerContent[`${r.content_type}:${r.content_id}`] || 1);
    return {
      ...r,
      reporter: usernames[r.reporter_user_id],
      book: r.content_type === 'book' ? booksById[Number(r.content_id)] : null,
      urgencySuggested: suggested,
      urgencyEffective: effectiveUrgency(r.urgency, suggested),
    };
  });

  const feedbackItems = feedback.map((r) => {
    const suggested = suggestFeedbackUrgency(r.category);
    return {
      ...r,
      reporter: usernames[r.user_id],
      imageSignedUrl: r.image_url ? signedByPath[r.image_url] || null : null,
      urgencySuggested: suggested,
      urgencyEffective: effectiveUrgency(r.urgency, suggested),
    };
  });

  return { content: contentItems, feedback: feedbackItems };
}

function UrgencyBadge({ level, manual }) {
  const style = URGENCY_STYLE[level];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${style.chip}`}>
      <span className={`h-2 w-2 rounded-full ${style.dot}`} />
      {URGENCY_LABEL[level]}
      {manual && <span className="opacity-70">· manual</span>}
    </span>
  );
}

function ReportControls({ kind, report }) {
  const isPending = report.status === 'pending';
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
      {isPending ? (
        <>
          <StatusButton kind={kind} id={report.id} status="reviewed" className="bg-slate-900 text-white hover:bg-slate-800">
            Resuelto
          </StatusButton>
          <StatusButton
            kind={kind}
            id={report.id}
            status="dismissed"
            className="border border-slate-300 text-slate-700 hover:bg-slate-100"
          >
            Descartar
          </StatusButton>
        </>
      ) : (
        <>
          <span className="text-xs text-slate-500">
            {STATUS_LABEL[report.status] || report.status} · {formatDate(report.reviewed_at)}
          </span>
          <StatusButton kind={kind} id={report.id} status="pending" className="border border-slate-300 text-slate-700 hover:bg-slate-100">
            Reabrir
          </StatusButton>
        </>
      )}

      <form action={setReportUrgency} className="ml-auto flex items-center gap-1">
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="id" value={report.id} />
        <select
          name="urgency"
          defaultValue={report.urgency || 'auto'}
          className="rounded-md border border-slate-300 px-2 py-1 text-xs"
        >
          <option value="auto">Automática ({URGENCY_LABEL[report.urgencySuggested]})</option>
          {URGENCY_LEVELS.map((level) => (
            <option key={level} value={level}>
              {URGENCY_LABEL[level]}
            </option>
          ))}
        </select>
        <button type="submit" className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100">
          Cambiar
        </button>
      </form>
    </div>
  );
}

function StatusButton({ kind, id, status, className, children }) {
  return (
    <form action={setReportStatus}>
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <button type="submit" className={`rounded-md px-3 py-1.5 text-sm font-medium ${className}`}>
        {children}
      </button>
    </form>
  );
}

function ContentReportCard({ report }) {
  const { book } = report;
  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <UrgencyBadge level={report.urgencyEffective} manual={Boolean(report.urgency)} />
        <span className="text-sm font-medium text-slate-900">{REASON_LABEL[report.reason] || report.reason}</span>
        <span className="text-xs text-slate-500">
          {report.reporter ? `@${report.reporter}` : 'usuario eliminado'} · {formatDate(report.created_at)}
        </span>
      </div>

      {report.detail && <p className="mt-2 text-sm text-slate-700">{report.detail}</p>}

      <div className="mt-3 flex gap-3 rounded-lg bg-slate-50 p-3">
        {book ? (
          <>
            {book.cover_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={book.cover_url} alt="" className="h-20 w-14 flex-none rounded object-cover" />
            ) : (
              <div className="flex h-20 w-14 flex-none items-center justify-center rounded bg-slate-200 text-[10px] text-slate-500">
                Sin portada
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-900">{book.title}</p>
              <p className="truncate text-sm text-slate-600">{book.author}</p>
              <p className="mt-0.5 text-xs text-slate-500">
                #{book.id} · ISBN: {book.isbn13 || book.isbn || '—'}
              </p>
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-500">
            {report.content_type} #{report.content_id} (el contenido ya no existe o no es un libro)
          </p>
        )}
      </div>

      <ReportControls kind="content" report={report} />
    </li>
  );
}

function FeedbackCard({ report }) {
  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <UrgencyBadge level={report.urgencyEffective} manual={Boolean(report.urgency)} />
        <span className="text-sm font-medium text-slate-900">{report.category}</span>
        <span className="text-xs text-slate-500">
          {report.reporter ? `@${report.reporter}` : 'usuario eliminado'} · {formatDate(report.created_at)}
        </span>
      </div>

      <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{report.message}</p>

      {report.imageSignedUrl && (
        <a href={report.imageSignedUrl} target="_blank" rel="noreferrer" className="mt-3 inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={report.imageSignedUrl} alt="Adjunto" className="max-h-48 rounded-lg border border-slate-200" />
        </a>
      )}
      {report.image_url && !report.imageSignedUrl && (
        <p className="mt-2 text-xs text-slate-500">Hay un adjunto pero no se pudo generar el enlace.</p>
      )}

      <ReportControls kind="feedback" report={report} />
    </li>
  );
}

function Section({ title, description, items, renderItem, emptyText }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold">
        {title} ({items.length})
      </h2>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
      {items.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
          {emptyText}
        </p>
      ) : (
        <ul className="mt-4 space-y-3">{items.map(renderItem)}</ul>
      )}
    </section>
  );
}

export default async function ReportesPage({ searchParams }) {
  const { filter } = await searchParams;
  const showAll = filter === 'all';
  const data = await loadReports();

  if (data.needsSetup) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-xl font-semibold">Reportes de usuarios</h1>
        <div className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900">
          <p className="font-medium">Falta un paso en la base de datos</p>
          <p className="mt-1">
            Ejecuta una vez el contenido de <code>docs/sql/reportes.sql</code> en el SQL Editor de Supabase (añade
            las columnas de urgencia y estado) y recarga esta página.
          </p>
        </div>
      </main>
    );
  }

  const visible = (items) => sortByUrgency(items.filter((r) => showAll || r.status === 'pending'));
  const content = visible(data.content);
  const feedback = visible(data.feedback);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Reportes de usuarios</h1>
          <p className="text-sm text-slate-500">
            Ordenados de más a menos urgentes. La urgencia se sugiere sola y puedes cambiarla a mano.
          </p>
        </div>
        <div className="flex gap-1 text-sm">
          <a
            href="/reportes"
            className={`rounded-md border px-3 py-1.5 ${!showAll ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 hover:bg-slate-100'}`}
          >
            Pendientes
          </a>
          <a
            href="/reportes?filter=all"
            className={`rounded-md border px-3 py-1.5 ${showAll ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 hover:bg-slate-100'}`}
          >
            Todos
          </a>
        </div>
      </div>

      <Section
        title="Contenido reportado"
        description="Reportes de usuarios sobre libros u otro contenido."
        items={content}
        renderItem={(r) => <ContentReportCard key={r.id} report={r} />}
        emptyText="No hay reportes de contenido."
      />

      <Section
        title="Feedback de usuarios"
        description="Sugerencias, errores y comentarios enviados desde la app."
        items={feedback}
        renderItem={(r) => <FeedbackCard key={r.id} report={r} />}
        emptyText="No hay feedback."
      />
    </main>
  );
}
