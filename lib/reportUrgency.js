// Urgencia de los reportes de usuarios. La sugerencia es automática; si el
// admin fija un valor a mano (columna `urgency`) ese manda.

export const URGENCY_LEVELS = ['green', 'yellow', 'orange', 'red', 'black'];

export const URGENCY_LABEL = {
  green: 'Baja',
  yellow: 'Media',
  orange: 'Alta',
  red: 'Muy alta',
  black: 'Crítica',
};

// content_reports.reason admite: explicit, incorrect, spam, other.
const CONTENT_BASE = { incorrect: 0, other: 1, spam: 1, explicit: 3 };

// feedback_reports.category: las definidas en SoporteCategoria de la app.
const FEEDBACK_BASE = {
  'Error técnico': 2,
  Funcionalidad: 1,
  Libro: 1,
  Autor: 1,
  Estadísticas: 1,
  Portadas: 1,
  Reseñas: 1,
  Sugerencia: 0,
};

const DEFAULT_BASE = 1; // motivo/categoría desconocidos → amarillo

function clampLevel(index) {
  return URGENCY_LEVELS[Math.min(Math.max(index, 0), URGENCY_LEVELS.length - 1)];
}

// sameContentCount: reportes pendientes sobre el mismo contenido (incluido este).
// Sube un nivel por cada 2 reportes extra.
export function suggestContentUrgency(reason, sameContentCount = 1) {
  const base = CONTENT_BASE[reason] ?? DEFAULT_BASE;
  const escalation = Math.floor(Math.max(sameContentCount - 1, 0) / 2);
  return clampLevel(base + escalation);
}

export function suggestFeedbackUrgency(category) {
  return clampLevel(FEEDBACK_BASE[category] ?? DEFAULT_BASE);
}

export function effectiveUrgency(manual, suggested) {
  return URGENCY_LEVELS.includes(manual) ? manual : suggested;
}
