import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateValue, parseOrganicShare, DEFAULT_ORGANIC_SHARE } from './valuation.js';

const close = (a, b, eps = 0.001) => assert.ok(Math.abs(a - b) < eps, `${a} no es ≈ ${b}`);

// Datos reales de hoy: 34 usuarios, 32 MAU, 82 % nuevos, solo 6 usuarios de hace ≥ 30 días.
const today = { total: 34, mau: 32, dau: 19, new30d: 28, total30dAgo: 6, cohortRetained: 4 };

test('caso de hoy: todos los pesos valen 0 y sale ≈ 118 € con v = 3', () => {
  const r = estimateValue(today, 0.9);
  assert.equal(r.wRet, 0);
  assert.equal(r.wStick, 0);
  assert.equal(r.wGrowth, 0);
  assert.equal(r.MRet, 1);
  assert.equal(r.MStick, 1);
  assert.equal(r.MGrowth, 1);
  close(r.MOrg, 1.23);
  close(r.values.central, 32 * 3 * 1.23 + 0.2 * 2);
  close(r.values.central, 118.48, 0.01);
});

test('rango: prudente < central < optimista', () => {
  const { values } = estimateValue(today, 0.9);
  assert.ok(values.prudent < values.central && values.central < values.optimistic);
});

test('retención: peso 0 con 30 o menos, proporcional hasta 100, valor bruto acotado a 0,5–1,5', () => {
  const base = { ...today, total: 200, new30d: 20 };
  assert.equal(estimateValue({ ...base, total30dAgo: 30, cohortRetained: 30 }).wRet, 0);
  close(estimateValue({ ...base, total30dAgo: 65, cohortRetained: 26 }).wRet, 0.5);
  assert.equal(estimateValue({ ...base, total30dAgo: 100, cohortRetained: 100 }).wRet, 1);
  assert.equal(estimateValue({ ...base, total30dAgo: 100, cohortRetained: 0 }).mRet, 0.5);
  assert.equal(estimateValue({ ...base, total30dAgo: 100, cohortRetained: 100 }).mRet, 1.5);
  // r = 40 % con peso entero: 0,5 + 3,33 × 0,3
  const full = estimateValue({ ...base, total30dAgo: 100, cohortRetained: 40 });
  close(full.MRet, 0.5 + 3.33 * 0.3);
  // a medias: M = 1 + w × (m − 1)
  const half = estimateValue({ ...base, total30dAgo: 65, cohortRetained: 26 }); // r = 40 %, w = 0,5
  close(half.MRet, 1 + 0.5 * (half.mRet - 1));
});

test('enganche: peso 0 con ≥ 50 % nuevos, 1 con ≤ 20 %, proporcional entre medias; bruto 0,6–1,4', () => {
  const mature = { total: 1000, mau: 400, dau: 200, new30d: 200, total30dAgo: 800, cohortRetained: 400 };
  assert.equal(estimateValue(mature).wStick, 1); // 20 % nuevos
  assert.equal(estimateValue({ ...mature, new30d: 500 }).wStick, 0);
  assert.equal(estimateValue({ ...mature, new30d: 700 }).wStick, 0);
  close(estimateValue({ ...mature, new30d: 350 }).wStick, 0.5); // 35 % nuevos
  assert.equal(estimateValue(mature).mStick, 1.4); // 0,6 + 4 × 0,4 = 2,2 → tope 1,4
  assert.equal(estimateValue({ ...mature, dau: 4 }).mStick, 0.6);
  close(estimateValue({ ...mature, dau: 100 }).MStick, 0.6 + 4 * (0.25 - 0.1));
});

test('crecimiento: continuo 0,8 + 2g acotado a 0,8–1,3; peso 0 con ≤ 50 usuarios hace 30 días y 1 con ≥ 100', () => {
  const s = { total: 200, mau: 100, dau: 40, new30d: 20, total30dAgo: 100, cohortRetained: 50 };
  const grow = estimateValue(s); // g = +100 %
  assert.equal(grow.wGrowth, 1);
  assert.equal(grow.mGrowth, 1.3);
  assert.equal(grow.MGrowth, 1.3);
  close(estimateValue({ ...s, total: 110 }).mGrowth, 0.8 + 2 * 0.1); // g = +10 %
  assert.equal(estimateValue({ ...s, total: 50 }).mGrowth, 0.8); // la base cae: g = −50 %
  assert.equal(estimateValue({ ...s, total30dAgo: 50, total: 100 }).wGrowth, 0);
  close(estimateValue({ ...s, total30dAgo: 75, total: 100 }).wGrowth, 0.5);
  assert.equal(estimateValue({ ...s, total30dAgo: 0 }).MGrowth, 1);
});

test('sin usuarios no rompe', () => {
  const r = estimateValue({ total: 0, mau: 0, dau: 0, new30d: 0, total30dAgo: 0, cohortRetained: 0 });
  assert.equal(r.values.central, 0);
  close(r.multiplier, 1.23); // solo el origen orgánico (0,9) aporta
  assert.equal(r.lowMau, true);
});

test('% orgánico: acepta coma, punto y porcentaje; usa 0,9 por defecto', () => {
  assert.equal(parseOrganicShare(undefined), DEFAULT_ORGANIC_SHARE);
  assert.equal(parseOrganicShare(''), DEFAULT_ORGANIC_SHARE);
  assert.equal(parseOrganicShare('abc'), DEFAULT_ORGANIC_SHARE);
  assert.equal(parseOrganicShare('0,75'), 0.75);
  assert.equal(parseOrganicShare('0.75'), 0.75);
  assert.equal(parseOrganicShare('60'), 0.6);
  assert.equal(parseOrganicShare('60 %'), 0.6);
  assert.equal(parseOrganicShare('-3'), 0);
  assert.equal(parseOrganicShare('1000'), 1);
});
