import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { estimateValue, parseOrganicShare, DEFAULT_ORGANIC_SHARE, BASE_VALUES, LOW_MAU_THRESHOLD } from '@/lib/valuation';

export const dynamic = 'force-dynamic';

const DAY_MS = 24 * 60 * 60 * 1000;

// Cuenta filas de public.profiles. `filters` son pares [operador, columna, hace cuántos ms] (ventanas móviles hasta ahora).
async function countProfiles(...filters) {
  let query = supabaseAdmin().from('profiles').select('id', { count: 'exact', head: true });
  for (const [op, column, agoMs] of filters) query = query[op](column, new Date(Date.now() - agoMs).toISOString());
  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function loadStats() {
  const [total, active1d, active30d, new1d, new30d, total30dAgo, cohortOld, cohortRetained] = await Promise.all([
    countProfiles(),
    countProfiles(['gte', 'last_active_at', DAY_MS]),
    countProfiles(['gte', 'last_active_at', 30 * DAY_MS]),
    countProfiles(['gte', 'created_at', DAY_MS]),
    countProfiles(['gte', 'created_at', 30 * DAY_MS]),
    countProfiles(['lte', 'created_at', 30 * DAY_MS]),
    countProfiles(['lte', 'created_at', 14 * DAY_MS]),
    countProfiles(['lte', 'created_at', 14 * DAY_MS], ['gte', 'last_active_at', 7 * DAY_MS]),
  ]);
  return { total, active1d, active30d, new1d, new30d, total30dAgo, cohortOld, cohortRetained };
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

const eur = (n) => `${Math.round(n).toLocaleString('es-ES')} €`;
const pct = (x) => `${(x * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })} %`;
const num = (x) => x.toLocaleString('es-ES', { maximumFractionDigits: 2 });

function ValueCard({ label, value, base, highlight }) {
  return (
    <div className={`rounded-xl border px-5 py-4 shadow-sm ${highlight ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white'}`}>
      <p className="text-3xl font-semibold tabular-nums">{eur(value)}</p>
      <p className={`mt-1 text-sm ${highlight ? 'text-slate-100' : 'text-slate-700'}`}>{label}</p>
      <p className={`mt-0.5 text-xs ${highlight ? 'text-slate-300' : 'text-slate-500'}`}>{base} € por usuario activo al mes</p>
    </div>
  );
}

function Row({ name, value, note, applied }) {
  return (
    <tr className="border-t border-slate-100">
      <td className="py-2 pr-3 font-medium text-slate-800">{name}</td>
      <td className="py-2 pr-3 tabular-nums text-slate-900">×{num(value)}</td>
      <td className="py-2 text-xs text-slate-500">
        {applied ? '' : <span className="mr-1 rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600">neutro</span>}
        {note}
      </td>
    </tr>
  );
}

function Valuation({ s, organicShare }) {
  const v = estimateValue(
    {
      total: s.total,
      mau: s.active30d,
      dau: s.active1d,
      new30d: s.new30d,
      total30dAgo: s.total30dAgo,
      cohortOld: s.cohortOld,
      cohortRetained: s.cohortRetained,
    },
    organicShare
  );

  return (
    <section className="mt-10">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Valor estimado de la app</h2>
      <p className="mt-1 text-sm text-slate-500">
        Orden de magnitud a partir de los usuarios. Es orientativo: los parámetros son estimaciones, no un estándar.
      </p>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <ValueCard label="Prudente" value={v.values.prudent} base={BASE_VALUES.prudent} />
        <ValueCard label="Central" value={v.values.central} base={BASE_VALUES.central} highlight />
        <ValueCard label="Optimista" value={v.values.optimistic} base={BASE_VALUES.optimistic} />
      </div>

      {v.lowMau && (
        <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          Con menos de {LOW_MAU_THRESHOLD.toLocaleString('es-ES')} usuarios activos al mes, el valor está sobre todo en el código y la marca,
          no en los usuarios. Tómalo como una referencia para ver cómo evoluciona, no como un precio.
        </p>
      )}

      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold">Cómo se calcula</h3>
        <p className="mt-2 rounded-md bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700">
          V = MAU × v × m_ret × m_stick × m_org × m_crec + 0,2 × (Total − MAU)
        </p>
        <table className="mt-3 w-full text-left text-sm">
          <tbody>
            <Row
              name="Retención (m_ret)"
              value={v.mRet}
              applied={v.retentionUsed}
              note={
                v.retentionUsed
                  ? `${pct(v.retention)} de los usuarios de hace más de 14 días han estado activos esta semana (${s.cohortRetained} de ${s.cohortOld}).`
                  : `Solo hay ${s.cohortOld} usuarios de hace más de 14 días; hacen falta 30 para que cuente.`
              }
            />
            <Row
              name="Enganche (m_stick)"
              value={v.mStick}
              applied={v.stickinessUsed}
              note={
                v.stickinessUsed
                  ? `DAU/MAU = ${pct(v.stickiness)} (${s.active1d} activos hoy entre ${s.active30d} del mes).`
                  : `Los nuevos del mes son el ${pct(s.total ? s.new30d / s.total : 0)} del total; no cuenta hasta que sean menos del 50 %.`
              }
            />
            <Row name="Origen (m_org)" value={v.mOrg} applied note={`${pct(v.organicShare)} de usuarios orgánicos (lo pones tú, abajo).`} />
            <Row
              name="Crecimiento (m_crec)"
              value={v.mGrowth}
              applied={v.growthUsed}
              note={
                v.growth === null
                  ? 'No había usuarios hace 30 días, no se puede medir.'
                  : `${v.growth >= 0 ? '+' : ''}${pct(v.growth)} de usuarios totales en 30 días (${s.total30dAgo} → ${s.total}). Da ×1,3 si supera el 15 % y hay al menos 100 usuarios.`
              }
            />
          </tbody>
        </table>
        <p className="mt-3 text-xs text-slate-500">
          Multiplicador total: ×{num(v.multiplier)} sobre {s.active30d} usuarios activos al mes. Los {s.total - s.active30d} usuarios no
          activos suman {eur(v.inactiveValue)} (0,2 € cada uno).
        </p>

        <form method="GET" action="/estadisticas" className="mt-4 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-4">
          <label className="text-sm text-slate-700">
            Usuarios orgánicos (0–100 %)
            <input
              type="text"
              name="o"
              inputMode="decimal"
              defaultValue={Math.round(organicShare * 100)}
              className="ml-2 w-20 rounded-md border border-slate-300 px-2 py-1 text-sm"
            />
          </label>
          <button type="submit" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100">
            Recalcular
          </button>
          <span className="text-xs text-slate-500">
            La app no sabe de dónde viene cada usuario, así que lo estimas tú (por defecto {Math.round(DEFAULT_ORGANIC_SHARE * 100)} %). No se guarda.
          </span>
        </form>
      </div>
    </section>
  );
}

export default async function StatsPage({ searchParams }) {
  const params = await searchParams;
  const organicShare = parseOrganicShare(params?.o);
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

      <Valuation s={s} organicShare={organicShare} />

      <p className="mt-8 text-xs text-slate-500">
        «Último día» son las últimas 24 horas y «último mes» los últimos 30 días. Un usuario cuenta como activo si abrió la app
        en ese periodo (campo <code>last_active_at</code> de su perfil).
      </p>
    </main>
  );
}
