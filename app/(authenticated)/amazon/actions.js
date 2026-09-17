'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function requestEnrichRun() {
  const supabase = supabaseAdmin();

  // Solo pasa a 'pending' si estaba 'idle' — evita encolar dos veces si se
  // pulsa el botón varias veces seguidas mientras ya hay algo pendiente o
  // corriendo.
  const { data, error } = await supabase
    .from('amazon_enrich_status')
    .update({ status: 'pending', requested_at: new Date().toISOString() })
    .eq('id', 1)
    .eq('status', 'idle')
    .select();

  if (error) throw new Error(error.message);
  // Si no afectó ninguna fila es que ya estaba pending/running (carrera de
  // doble clic) — no pasa nada, simplemente no se vuelve a encolar.

  revalidatePath('/amazon');
}
