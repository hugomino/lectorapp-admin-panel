import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestContentUrgency, suggestFeedbackUrgency, effectiveUrgency, URGENCY_LEVELS } from './reportUrgency.js';

test('niveles ordenados de menor a mayor', () => {
  assert.deepEqual(URGENCY_LEVELS, ['green', 'yellow', 'orange', 'red', 'black']);
});

test('motivo de contenido: base por reason', () => {
  assert.equal(suggestContentUrgency('incorrect', 1), 'green');
  assert.equal(suggestContentUrgency('other', 1), 'yellow');
  assert.equal(suggestContentUrgency('spam', 1), 'yellow');
  assert.equal(suggestContentUrgency('explicit', 1), 'red');
});

test('motivo desconocido cae en amarillo', () => {
  assert.equal(suggestContentUrgency('algo-nuevo', 1), 'yellow');
});

test('sube un nivel por cada 2 reportes extra sobre el mismo contenido', () => {
  assert.equal(suggestContentUrgency('incorrect', 2), 'green');
  assert.equal(suggestContentUrgency('incorrect', 3), 'yellow');
  assert.equal(suggestContentUrgency('incorrect', 5), 'orange');
});

test('nunca pasa de negro', () => {
  assert.equal(suggestContentUrgency('explicit', 3), 'black');
  assert.equal(suggestContentUrgency('explicit', 50), 'black');
});

test('feedback: base por categoría, sin escalado', () => {
  assert.equal(suggestFeedbackUrgency('Error técnico'), 'orange');
  assert.equal(suggestFeedbackUrgency('Funcionalidad'), 'yellow');
  assert.equal(suggestFeedbackUrgency('Sugerencia'), 'green');
  assert.equal(suggestFeedbackUrgency('otra cosa'), 'yellow');
});

test('el ajuste manual manda sobre la sugerencia', () => {
  assert.equal(effectiveUrgency('black', 'green'), 'black');
  assert.equal(effectiveUrgency(null, 'orange'), 'orange');
  assert.equal(effectiveUrgency('valor-invalido', 'orange'), 'orange');
});
