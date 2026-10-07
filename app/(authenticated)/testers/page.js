import { supabaseAdmin } from '@/lib/supabaseAdmin';
import CopyEmailsButton from '@/components/CopyEmailsButton';
import ConfirmSubmitButton from '@/components/ConfirmSubmitButton';
import { approveTesters, unapproveTester, removeTester, sendInvites, sendTestEmail } from './actions';

export const dynamic = 'force-dynamic';

const PRIMARY = 'rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50';
const SECONDARY = 'rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100';

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

async function loadTesters() {
  const supabase = supabaseAdmin();

  // Sonda: si faltan las columnas de docs/sql/testers.sql (o la tabla), se avisa en vez de romper.
  const probe = await supabase.from('beta_testers_android').select('email, approved_at, invited_at').limit(1);
  if (probe.error) {
    const code = probe.error.code;
    if (code === '42703' || code === '42P01' || code === 'PGRST205' || code === 'PGRST204') return { needsSetup: true };
    throw new Error(probe.error.message);
  }

  const { data, error } = await supabase
    .from('beta_testers_android')
    .select('email, lang, created_at, is_tester_added, welcome_email_sent, approved_at, invited_at')
    .order('created_at', { ascending: false })
    .limit(1000);
  if (error) throw new Error(error.message);

  return {
    pending: data.filter((r) => !r.is_tester_added),
    approved: data.filter((r) => r.is_tester_added && !r.welcome_email_sent),
    invited: data.filter((r) => r.welcome_email_sent),
    total: data.length,
  };
}

function Banner({ params }) {
  const { approved, sent, removed, test, error } = params;
  const items = [];
  if (approved) items.push({ kind: 'ok', text: `${approved} ${approved === '1' ? 'persona aprobada' : 'personas aprobadas'}. Ya puedes enviarles el correo con el botón de abajo.` });
  if (sent !== undefined) items.push({ kind: 'ok', text: `${sent} ${sent === '1' ? 'correo enviado' : 'correos enviados'}.` });
  if (removed) items.push({ kind: 'ok', text: 'Correo eliminado de la lista.' });
  if (test) items.push({ kind: 'ok', text: `Correo de prueba enviado a ${test}. Mira también la carpeta de spam.` });
  if (error) items.push({ kind: 'error', text: error });
  if (items.length === 0) return null;
  return (
    <div className="mt-4 space-y-2">
      {items.map((item, i) => (
        <p
          key={i}
          className={`rounded-lg border px-4 py-2.5 text-sm ${
            item.kind === 'ok' ? 'border-green-200 bg-green-50 text-green-900' : 'border-red-200 bg-red-50 text-red-900'
          }`}
        >
          {item.text}
        </p>
      ))}
    </div>
  );
}

function LangTag({ lang }) {
  return (
    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold uppercase text-slate-600">{lang || '—'}</span>
  );
}

function Stat({ value, label }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}

function Section({ step, title, description, children }) {
  return (
    <section className="mt-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        {step && (
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
            {step}
          </span>
        )}
        {title}
      </h2>
      {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      {children}
    </section>
  );
}

function Empty({ children }) {
  return <p className="mt-4 rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">{children}</p>;
}

export default async function TestersPage({ searchParams }) {
  const params = await searchParams;
  const data = await loadTesters();

  if (data.needsSetup) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-xl font-semibold">Testers de la prueba cerrada</h1>
        <div className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900">
          <p className="font-medium">Falta un paso en la base de datos</p>
          <p className="mt-1">
            Ejecuta una vez el contenido de <code>docs/sql/testers.sql</code> en el SQL Editor de Supabase y recarga
            esta página.
          </p>
        </div>
      </main>
    );
  }

  const { pending, approved, invited, total } = data;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-xl font-semibold">Testers de la prueba cerrada</h1>
      <p className="text-sm text-slate-500">
        Personas que se apuntan desde lectorapp.es. Primero se añaden en Play Console, luego se aprueban aquí y por último
        se les envía el correo con el botón de descarga.
      </p>

      <Banner params={params} />

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat value={total} label="solicitudes en total" />
        <Stat value={pending.length} label="por aprobar" />
        <Stat value={approved.length} label="aprobados, sin correo" />
        <Stat value={invited.length} label="con correo enviado" />
      </div>

      <Section
        step="1"
        title={`Nuevas solicitudes (${pending.length})`}
        description="Copia estos correos y pégalos en Play Console → Pruebas → Prueba cerrada → Testers. Cuando estén añadidos, apruébalos aquí."
      >
        {pending.length === 0 ? (
          <Empty>No hay solicitudes pendientes de aprobar.</Empty>
        ) : (
          <>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <CopyEmailsButton emails={pending.map((r) => r.email)} />
              <a href="/testers/export" className={SECONDARY}>
                Descargar CSV
              </a>
            </div>

            <ul className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200">
              {pending.map((r) => (
                <li key={r.email} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <input type="checkbox" form="approve-form" name="email" value={r.email} defaultChecked className="h-4 w-4" />
                  <span className="min-w-0 flex-1 truncate font-medium text-slate-900">{r.email}</span>
                  <LangTag lang={r.lang} />
                  <span className="hidden w-28 text-right text-xs text-slate-500 sm:block">{formatDate(r.created_at)}</span>
                  <form action={removeTester}>
                    <input type="hidden" name="actionEmail" value={r.email} />
                    <ConfirmSubmitButton
                      confirmText={`¿Borrar ${r.email} de la lista?\nSe elimina su correo de la base de datos.`}
                      className="text-xs text-red-600 hover:underline"
                    >
                      Borrar
                    </ConfirmSubmitButton>
                  </form>
                </li>
              ))}
            </ul>
            <form id="approve-form" action={approveTesters} className="mt-4 flex flex-wrap items-center gap-3">
              <ConfirmSubmitButton
                confirmText={'¿Ya has añadido los correos seleccionados en Play Console?\n\nSe marcarán como aprobados. El correo de bienvenida se envía en el paso 2.'}
                className={PRIMARY}
              >
                Aprobar como testers (los marcados)
              </ConfirmSubmitButton>
              <span className="text-xs text-slate-500">Desmarca a quien no quieras aprobar todavía.</span>
            </form>
          </>
        )}
      </Section>

      <Section
        step="2"
        title={`Aprobados, pendientes de avisar (${approved.length})`}
        description="Les llegará el correo con el botón para descargar LectorApp en Google Play, cada uno en su idioma. El correo no admite respuestas."
      >
        {approved.length === 0 ? (
          <Empty>No hay nadie esperando el correo.</Empty>
        ) : (
          <>
            <ul className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200">
              {approved.map((r) => (
                <li key={r.email} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate font-medium text-slate-900">{r.email}</span>
                  <LangTag lang={r.lang} />
                  <span className="hidden w-32 text-right text-xs text-slate-500 sm:block">
                    Aprobado {formatDate(r.approved_at)}
                  </span>
                  <form action={unapproveTester}>
                    <input type="hidden" name="actionEmail" value={r.email} />
                    <ConfirmSubmitButton
                      confirmText={`¿Deshacer la aprobación de ${r.email}?\nVolverá a la lista de nuevas solicitudes.`}
                      className="text-xs text-slate-500 hover:underline"
                    >
                      Deshacer
                    </ConfirmSubmitButton>
                  </form>
                </li>
              ))}
            </ul>
            <form action={sendInvites} className="mt-4">
              <ConfirmSubmitButton
                confirmText={`Se enviará el correo de bienvenida a ${approved.length} ${approved.length === 1 ? 'persona' : 'personas'}. ¿Continuar?`}
                className={PRIMARY}
              >
                Enviar correos de bienvenida ({approved.length})
              </ConfirmSubmitButton>
            </form>
          </>
        )}
      </Section>

      <Section title={`Ya avisados (${invited.length})`} description="Los últimos 30 que han recibido el correo.">
        {invited.length === 0 ? (
          <Empty>Todavía no se ha enviado ningún correo.</Empty>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200">
            {[...invited]
              .sort((a, b) => new Date(b.invited_at || 0) - new Date(a.invited_at || 0))
              .slice(0, 30)
              .map((r) => (
                <li key={r.email} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate text-slate-900">{r.email}</span>
                  <LangTag lang={r.lang} />
                  <span className="text-xs text-slate-500">Avisado {formatDate(r.invited_at)}</span>
                </li>
              ))}
          </ul>
        )}
      </Section>

      <Section title="Enviarme un correo de prueba" description="Para ver cómo les llega el mensaje. No cambia nada en la lista.">
        <form action={sendTestEmail} className="mt-4 flex flex-wrap items-center gap-2">
          <input
            type="email"
            name="to"
            required
            placeholder="tu@correo.com"
            className="min-w-[14rem] flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
          <select name="lang" defaultValue="es" className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
            <option value="es">Español</option>
            <option value="en">English</option>
          </select>
          <button type="submit" className={SECONDARY}>
            Enviar prueba
          </button>
        </form>
      </Section>
    </main>
  );
}
