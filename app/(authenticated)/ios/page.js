import { supabaseAdmin } from '@/lib/supabaseAdmin';
import CopyEmailsButton from '@/components/CopyEmailsButton';
import ConfirmSubmitButton from '@/components/ConfirmSubmitButton';
import { removeIosUser, notifyAll, sendIosTestEmail } from './actions';

export const dynamic = 'force-dynamic';

const PRIMARY = 'rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50';
const SECONDARY = 'rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100';
const INPUT = 'rounded-md border border-slate-300 px-3 py-1.5 text-sm';

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

async function loadUsers() {
  const { data, error } = await supabaseAdmin()
    .from('ios_waitlist')
    .select('email, lang, created_at, notified_at')
    .order('created_at', { ascending: false })
    .limit(5000);
  if (error) throw new Error(error.message);

  return {
    pending: data.filter((r) => !r.notified_at),
    notified: data.filter((r) => r.notified_at),
    total: data.length,
  };
}

function Banner({ params }) {
  const { sent, removed, test, error } = params;
  const items = [];
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

function Section({ title, description, children }) {
  return (
    <section className="mt-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold">{title}</h2>
      {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      {children}
    </section>
  );
}

function Empty({ children }) {
  return <p className="mt-4 rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">{children}</p>;
}

export default async function IosUsersPage({ searchParams }) {
  const params = await searchParams;
  const { pending, notified, total } = await loadUsers();

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-xl font-semibold">Usuarios iOS</h1>
      <p className="text-sm text-slate-500">
        Personas que se han apuntado en lectorapp.es para que les avisemos cuando LectorApp salga en iPhone.
      </p>

      <Banner params={params} />

      <div className="mt-5 grid grid-cols-3 gap-3">
        <Stat value={total} label="apuntados en total" />
        <Stat value={pending.length} label="pendientes de avisar" />
        <Stat value={notified.length} label="ya avisados" />
      </div>

      <Section
        title={`Pendientes de avisar (${pending.length})`}
        description="Cuando LectorApp esté publicada en la App Store, pega su enlace y pulsa el botón: se envía un correo a todos los de esta lista, cada uno en su idioma. El correo no admite respuestas."
      >
        {pending.length === 0 ? (
          <Empty>No hay nadie esperando el aviso.</Empty>
        ) : (
          <>
            <div className="mt-4">
              <CopyEmailsButton emails={pending.map((r) => r.email)} />
            </div>
            <ul className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200">
              {pending.map((r) => (
                <li key={r.email} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate font-medium text-slate-900">{r.email}</span>
                  <LangTag lang={r.lang} />
                  <span className="hidden w-28 text-right text-xs text-slate-500 sm:block">{formatDate(r.created_at)}</span>
                  <form action={removeIosUser}>
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

            <form action={notifyAll} className="mt-5 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <label htmlFor="notify-url" className="block text-sm font-medium text-slate-800">
                Enlace de LectorApp en la App Store
              </label>
              <input
                id="notify-url"
                type="url"
                name="appUrl"
                required
                pattern="https://apps\.apple\.com/\S+"
                placeholder="https://apps.apple.com/es/app/lectorapp/id…"
                className={`${INPUT} w-full`}
              />
              <ConfirmSubmitButton
                confirmText={`Se enviará el correo "LectorApp ya está en iPhone" a ${pending.length} ${pending.length === 1 ? 'persona' : 'personas'}.\n\nNo se puede deshacer. ¿Ya está publicada en la App Store?`}
                className={PRIMARY}
              >
                Ya está en iOS: avisar a todos ({pending.length})
              </ConfirmSubmitButton>
            </form>
          </>
        )}
      </Section>

      <Section title={`Ya avisados (${notified.length})`} description="Los últimos 30 que han recibido el correo.">
        {notified.length === 0 ? (
          <Empty>Todavía no se ha enviado ningún aviso.</Empty>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200">
            {[...notified]
              .sort((a, b) => new Date(b.notified_at) - new Date(a.notified_at))
              .slice(0, 30)
              .map((r) => (
                <li key={r.email} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate text-slate-900">{r.email}</span>
                  <LangTag lang={r.lang} />
                  <span className="text-xs text-slate-500">Avisado {formatDate(r.notified_at)}</span>
                </li>
              ))}
          </ul>
        )}
      </Section>

      <Section title="Enviarme un correo de prueba" description="Para ver cómo les llegará el mensaje. No cambia nada en la lista.">
        <form action={sendIosTestEmail} className="mt-4 space-y-2">
          <input
            type="url"
            name="appUrl"
            required
            pattern="https://apps\.apple\.com/\S+"
            placeholder="Enlace de la App Store (https://apps.apple.com/…)"
            className={`${INPUT} w-full`}
          />
          <div className="flex flex-wrap items-center gap-2">
            <input type="email" name="to" required placeholder="tu@correo.com" className={`${INPUT} min-w-[14rem] flex-1`} />
            <select name="lang" defaultValue="es" className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
              <option value="es">Español</option>
              <option value="en">English</option>
            </select>
            <button type="submit" className={SECONDARY}>
              Enviar prueba
            </button>
          </div>
        </form>
      </Section>
    </main>
  );
}
