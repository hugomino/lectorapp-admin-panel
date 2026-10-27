import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

const DAY_MS = 24 * 60 * 60 * 1000;

// Cuenta filas de public.profiles con un filtro opcional sobre una columna de fecha (ventana móvil hasta ahora).
async function countProfiles(column, sinceMs) {
  let query = supabaseAdmin().from('profiles').select('id', { count: 'exact', head: true });
  if (column) query = query.gte(column, new Date(Date.now() - sinceMs).toISOString());
  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function loadStats() {
  const [total, active1d, active30d, new1d, new30d] = await Promise.all([
    countProfiles(),
    countProfiles('last_active_at', DAY_MS),
    countProfiles('last_active_at', 30 * DAY_MS),
    countProfiles('created_at', DAY_MS),
    countProfiles('created_at', 30 * DAY_MS),
  ]);
  return { total, active1d, active30d, new1d, new30d };
}

function percent(part, whole) {
  if (!whole) return null;
  return `${Math.round((part / whole) * 100)} % del total`;
}

function Stat({ value, label, hint }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
      <p className="text-3xl font-semibold tabular-nums">{value.toLocaleString('es-ES')}</p>
      <p className="mt-1 text-sm text-slate-700">{label}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

function Group({ title, children }) {
  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}

export default async function StatsPage() {
  const s = await loadStats();

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Estadísticas</h1>
          <p className="text-sm text-slate-500">Usuarios de la aplicación, calculados en el momento de abrir la página.</p>
        </div>
        <a href="/estadisticas" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100">
          Actualizar
        </a>
      </div>

      <div className="mt-6">
        <Stat value={s.total} label="Usuarios totales" hint="Cuentas con perfil en la app" />
      </div>

      <Group title="Usuarios activos">
        <Stat value={s.active1d} label="Activos en el último día" hint={percent(s.active1d, s.total)} />
        <Stat value={s.active30d} label="Activos en el último mes" hint={percent(s.active30d, s.total)} />
      </Group>

      <Group title="Usuarios nuevos">
        <Stat value={s.new1d} label="Nuevos en el último día" hint={percent(s.new1d, s.total)} />
        <Stat value={s.new30d} label="Nuevos en el último mes" hint={percent(s.new30d, s.total)} />
      </Group>

      <p className="mt-8 text-xs text-slate-500">
        «Último día» son las últimas 24 horas y «último mes» los últimos 30 días. Un usuario cuenta como activo si abrió la app
        en ese periodo (campo <code>last_active_at</code> de su perfil).
      </p>
    </main>
  );
}
