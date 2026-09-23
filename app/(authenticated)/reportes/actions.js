'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { URGENCY_LEVELS } from '@/lib/reportUrgency';

// Lista blanca: el formulario nunca decide el nombre de la tabla.
const TABLES = { content: 'content_reports', feedback: 'feedback_reports' };
const STATUSES = ['pending', 'reviewed', 'dismissed'];

function resolveTable(formData) {
  const table = TABLES[formData.get('kind')];
  if (!table) throw new Error('Tipo de reporte no válido');
  return table;
}

export async function setReportStatus(formData) {
  const table = resolveTable(formData);
  const id = formData.get('id')?.toString();
  const status = formData.get('status')?.toString();
  if (!id || !STATUSES.includes(status)) throw new Error('Datos de reporte no válidos');

  const { error } = await supabaseAdmin()
    .from(table)
    .update({ status, reviewed_at: status === 'pending' ? null : new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);

  revalidatePath('/reportes');
}

// urgency = 'auto' vuelve a la sugerencia automática (columna a null).
export async function setReportUrgency(formData) {
  const table = resolveTable(formData);
  const id = formData.get('id')?.toString();
  const value = formData.get('urgency')?.toString();
  if (!id || !(value === 'auto' || URGENCY_LEVELS.includes(value))) {
    throw new Error('Datos de reporte no válidos');
  }

  const { error } = await supabaseAdmin()
    .from(table)
    .update({ urgency: value === 'auto' ? null : value })
    .eq('id', id);
  if (error) throw new Error(error.message);

  revalidatePath('/reportes');
}
