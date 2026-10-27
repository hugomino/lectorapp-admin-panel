import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateValue, parseOrganicShare, DEFAULT_ORGANIC_SHARE } from './valuation.js';

const close = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) < eps, `${a} no es ≈ ${b}`);

// Caso del chat: MAU 32, 82 % nuevos, cohorte de retención demasiado pequeña, o = 0,9, total 34.
const today = { total: 34, mau: 32, dau: 20, new30d: 28, total30dAgo: 6, cohortOld: 6, cohortRetained: 5 };

test('caso de hoy: ≈ 118 € con v = 3', () => {
  const r = estimateValue(today, 0.9);
  assert.equal(r.mRet, 1);
  assert.equal(r.mStick, 1);
  assert.equal(r.mGrowth, 1); // total < 100 aunque g sea alto
  close(r.mOrg, 1.23);
  close(r.values.central, 32 * 3 * 1.23 + 0.2 * 2);
  close(r.values.central, 118.5, 0.1);
});

test('rango: prudente < central < optimista', () => {
  const { values } = estimateValue(today, 0.9);
  assert.ok(values.prudent < values.central && values.central < values.optimistic);
});

test('retención: se usa con cohorte ≥ 30 y se acota a 0,5–1,5', () => {
  const base = { ...today, cohortOld: 100 };
  assert.equal(estimateValue({ ...base, cohortRetained: 0 }).mRet, 0.5);
  assert.equal(estimateValue({ ...base, cohortRetained: 100 }).mRet, 1.5);
  close(estimateValue({ ...base, cohortRetained: 40 }).mRet, 0.5 + 3.33 * 0.3);
  assert.equal(estimateValue({ ...base, cohortOld: 29, cohortRetained: 29 }).mRet, 1);
});

test('enganche: solo si los nuevos del mes son < 50 % del total, acotado a 0,6–1,4', () => {
  const mature = { total: 1000, mau: 400, dau: 200, new30d: 100, total30dAgo: 900, cohortOld: 800, cohortRetained: 400 };
  assert.equal(estimateValue(mature).mStick, 1.4); // 0,6 + 4 × 0,4 = 2,2 → tope 1,4
  close(estimateValue({ ...mature, dau: 100 }).mStick, 0.6 + 4 * (0.25 - 0.1));
  assert.equal(estimateValue({ ...mature, dau: 4 }).mStick, 0.6);
  assert.equal(estimateValue({ ...mature, new30d: 500 }).mStick, 1);
});

test('crecimiento: 1,3 solo con g > 15 % y total ≥ 100', () => {
  const s = { ...today, total: 200, mau: 100, dau: 40, new30d: 40, total30dAgo: 160 };
  assert.equal(estimateValue(s).mGrowth, 1.3);
  assert.equal(estimateValue({ ...s, total30dAgo: 180 }).mGrowth, 1); // g = 11 %
  assert.equal(estimateValue({ ...s, total: 99, total30dAgo: 60 }).mGrowth, 1);
  assert.equal(estimateValue({ ...s, total30dAgo: 0 }).mGrowth, 1);
});

test('sin usuarios no rompe', () => {
  const r = estimateValue({ total: 0, mau: 0, dau: 0, new30d: 0, total30dAgo: 0, cohortOld: 0, cohortRetained: 0 });
  assert.equal(r.values.central, 0);
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
