// Valor monetario orientativo de la app a partir de sus usuarios.
//
//   V = MAU × v × M_ret × M_stick × M_org × M_crec  +  0,2 × (Total − MAU)
//
// Cada factor X ∈ {ret, stick, crec} entra «a medias» según cuántos datos fiables haya:
//   M_X = 1 + w_X × (m_X − 1)      con w_X entre 0 (cuenta ×1) y 1 (pesa entero), sin saltos.
// Los parámetros son estimaciones, no un estándar: sirve para tener un orden de magnitud, no una tasación.

export const BASE_VALUES = { prudent: 1, central: 3, optimistic: 8 };
export const DEFAULT_ORGANIC_SHARE = 0.9;

// Por debajo de este MAU el valor es sobre todo código y marca, no usuarios.
export const LOW_MAU_THRESHOLD = 1000;

const INACTIVE_USER_WEIGHT = 0.2;

const clamp = (x, min, max) => Math.min(max, Math.max(min, x));

// Interpreta el % orgánico escrito a mano (0,9 / 0.9 / 90 %) y lo deja entre 0 y 1.
export function parseOrganicShare(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return DEFAULT_ORGANIC_SHARE;
  const n = Number(String(raw).replace('%', '').replace(',', '.').trim());
  if (!Number.isFinite(n)) return DEFAULT_ORGANIC_SHARE;
  return clamp(n > 1 ? n / 100 : n, 0, 1);
}

// stats: { total, mau, dau, new30d, total30dAgo, cohortRetained }
//   total30dAgo    = usuarios dados de alta hace 30 días o más (es el grupo N30 de la retención y el «Total hace 30 días»)
//   cohortRetained = de ellos, los que han estado activos en los últimos 7 días
export function estimateValue(stats, organicShare = DEFAULT_ORGANIC_SHARE) {
  const { total, mau, dau, new30d, total30dAgo, cohortRetained } = stats;
  const n30 = total30dAgo;

  // Retención: r = activos en 7 días entre los dados de alta hace ≥ 30 días. Pesa de 30 (0) a 100 (1) usuarios.
  const retention = n30 > 0 ? cohortRetained / n30 : null;
  const mRet = retention === null ? 1 : clamp(0.5 + 3.33 * (retention - 0.1), 0.5, 1.5);
  const wRet = clamp((n30 - 30) / 70, 0, 1);

  // Enganche: s = DAU/MAU. Pesa 1 si los nuevos del mes son ≤ 20 % del total y 0 si son ≥ 50 %.
  const stickiness = mau > 0 ? dau / mau : null;
  const mStick = stickiness === null ? 1 : clamp(0.6 + 4 * (stickiness - 0.1), 0.6, 1.4);
  const wStick = total > 0 ? clamp((0.5 - new30d / total) / 0.3, 0, 1) : 0;

  // Crecimiento: g = (Total hoy − Total hace 30 días) / Total hace 30 días. Pesa de 50 (0) a 100 (1) usuarios hace 30 días.
  const growth = total30dAgo > 0 ? (total - total30dAgo) / total30dAgo : null;
  const mGrowth = growth === null ? 1 : clamp(0.8 + 2 * growth, 0.8, 1.3);
  const wGrowth = clamp((total30dAgo - 50) / 50, 0, 1);

  const MRet = 1 + wRet * (mRet - 1);
  const MStick = 1 + wStick * (mStick - 1);
  const MGrowth = 1 + wGrowth * (mGrowth - 1);
  const MOrg = 0.6 + 0.7 * organicShare;

  const inactiveValue = INACTIVE_USER_WEIGHT * (total - mau);
  const multiplier = MRet * MStick * MOrg * MGrowth;
  const at = (v) => mau * v * multiplier + inactiveValue;

  return {
    organicShare,
    retention,
    stickiness,
    growth,
    // valor bruto de cada factor (m), peso (w) y factor aplicado (M)
    mRet, wRet, MRet,
    mStick, wStick, MStick,
    mGrowth, wGrowth, MGrowth,
    MOrg,
    multiplier,
    inactiveValue,
    values: {
      prudent: at(BASE_VALUES.prudent),
      central: at(BASE_VALUES.central),
      optimistic: at(BASE_VALUES.optimistic),
    },
    lowMau: mau < LOW_MAU_THRESHOLD,
  };
}
