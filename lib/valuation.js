// Valor monetario orientativo de la app a partir de sus usuarios.
//
//   V = MAU × v × m_ret × m_stick × m_org × m_crec  +  0,2 × (Total − MAU)
//
// Los parámetros son estimaciones, no un estándar: sirve para tener un orden de magnitud, no una tasación.

export const BASE_VALUES = { prudent: 1, central: 3, optimistic: 8 };
export const DEFAULT_ORGANIC_SHARE = 0.9;

// Por debajo de este MAU el valor es sobre todo código y marca, no usuarios.
export const LOW_MAU_THRESHOLD = 1000;

const MIN_RETENTION_COHORT = 30;
const MIN_TOTAL_FOR_GROWTH = 100;
const INACTIVE_USER_WEIGHT = 0.2;

const clamp = (x, min, max) => Math.min(max, Math.max(min, x));

// Interpreta el % orgánico escrito a mano (0,9 / 0.9 / 90 %) y lo deja entre 0 y 1.
export function parseOrganicShare(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return DEFAULT_ORGANIC_SHARE;
  const n = Number(String(raw).replace('%', '').replace(',', '.').trim());
  if (!Number.isFinite(n)) return DEFAULT_ORGANIC_SHARE;
  return clamp(n > 1 ? n / 100 : n, 0, 1);
}

// stats: { total, mau, dau, new30d, total30dAgo, cohortOld, cohortRetained }
//   cohortOld      = usuarios dados de alta hace más de 14 días
//   cohortRetained = de ellos, los que han estado activos en los últimos 7 días
export function estimateValue(stats, organicShare = DEFAULT_ORGANIC_SHARE) {
  const { total, mau, dau, new30d, total30dAgo, cohortOld, cohortRetained } = stats;

  const retention = cohortOld >= MIN_RETENTION_COHORT ? cohortRetained / cohortOld : null;
  const mRet = retention === null ? 1 : clamp(0.5 + 3.33 * (retention - 0.1), 0.5, 1.5);

  // El enganche (DAU/MAU) solo cuenta si los recién llegados no dominan la base de usuarios.
  const stickiness = mau > 0 ? dau / mau : null;
  const stickUsable = stickiness !== null && total > 0 && new30d / total < 0.5;
  const mStick = stickUsable ? clamp(0.6 + 4 * (stickiness - 0.1), 0.6, 1.4) : 1;

  const mOrg = 0.6 + 0.7 * organicShare;

  const growth = total30dAgo > 0 ? (total - total30dAgo) / total30dAgo : null;
  const mGrowth = growth !== null && growth > 0.15 && total >= MIN_TOTAL_FOR_GROWTH ? 1.3 : 1;

  const inactiveValue = INACTIVE_USER_WEIGHT * (total - mau);
  const multiplier = mRet * mStick * mOrg * mGrowth;
  const at = (v) => mau * v * multiplier + inactiveValue;

  return {
    retention,
    stickiness,
    growth,
    organicShare,
    mRet,
    mStick,
    mOrg,
    mGrowth,
    retentionUsed: retention !== null,
    stickinessUsed: stickUsable,
    growthUsed: mGrowth > 1,
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
