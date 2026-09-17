import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requestEnrichRun } from './actions';

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

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('es-ES');
}

export default async function AmazonPage() {
  const status = await getStatus();
  const canTrigger = status.status === 'idle';

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Enriquecimiento de Amazon</h1>
          <p className="text-sm text-slate-500">
            Busca affiliate_url y amazon_cover_url para los libros que aún no los tienen.
          </p>
        </div>
        <a href="/amazon" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100">
          Actualizar
        </a>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-900">Estado: {STATUS_LABEL[status.status] || status.status}</p>
            <p className="mt-1 text-xs text-slate-500">
              Se ejecuta también automáticamente cada 4h en tu PC (tarea programada de Windows) — el botón solo
              adelanta la próxima pasada.
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
    </main>
  );
}
