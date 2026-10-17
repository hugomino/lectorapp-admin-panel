import { supabaseAdmin } from '@/lib/supabaseAdmin';
import MinVersionForm from '@/components/MinVersionForm';
import { setMinVersion } from './actions';

export const dynamic = 'force-dynamic';

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('es-ES', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

async function loadMinVersion() {
  const { data, error } = await supabaseAdmin()
    .from('app_config')
    .select('value, updated_at')
    .eq('key', 'min_version')
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

function Banner({ params }) {
  const { saved, error } = params;
  if (!saved && !error) return null;
  const ok = Boolean(saved) && !error;
  return (
    <p
      className={`mt-4 rounded-lg border px-4 py-2.5 text-sm ${
        ok ? 'border-green-200 bg-green-50 text-green-900' : 'border-red-200 bg-red-50 text-red-900'
      }`}
    >
      {ok ? `Guardado. Desde ahora, quien tenga una versión anterior a ${saved} tendrá que actualizar.` : error}
    </p>
  );
}

export default async function VersionesPage({ searchParams }) {
  const params = await searchParams;
  const config = await loadMinVersion();

  if (!config) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-xl font-semibold">Versiones</h1>
        <p className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900">
          No existe la clave <code>min_version</code> en la tabla <code>app_config</code>, así que no hay nada que
          editar desde aquí.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-xl font-semibold">Versiones</h1>
      <p className="text-sm text-slate-500">
        Controla desde qué versión de la app se permite entrar. A quien tenga una versión anterior le sale una pantalla
        que le obliga a actualizar.
      </p>

      <Banner params={params} />

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs uppercase tracking-wide text-slate-500">Versión mínima activa ahora</p>
        <p className="mt-1 font-mono text-3xl font-semibold">{config.value}</p>
        <p className="mt-1 text-xs text-slate-500">Cambiada por última vez el {formatDate(config.updated_at)}</p>

        <MinVersionForm action={setMinVersion} current={config.value} />

        <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-medium">Antes de subirla</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>
              Comprueba que esa versión ya está publicada en <strong>producción</strong> en Google Play. Si pones una
              más alta que la publicada, nadie podrá usar la app.
            </li>
            <li>Usa el nombre de versión de Play Console (p. ej. 1.3.0), no el código de versión.</li>
            <li>El cambio es inmediato. Para deshacerlo, vuelve a poner la versión anterior.</li>
          </ul>
        </div>
      </section>
    </main>
  );
}
