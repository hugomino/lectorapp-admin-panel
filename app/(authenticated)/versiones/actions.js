'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { isValidVersion } from '@/lib/version';

// Redirige a /versiones con un aviso (ok / error) que la página muestra arriba.
function back(params) {
  const qs = new URLSearchParams(params).toString();
  redirect(qs ? `/versiones?${qs}` : '/versiones');
}

// Cambia app_config.min_version: la app obliga a actualizar a quien tenga una versión anterior.
export async function setMinVersion(formData) {
  const version = formData.get('version')?.toString().trim() ?? '';
  if (!isValidVersion(version)) {
    back({ error: 'La versión debe tener el formato 1.3.0 (tres números separados por puntos).' });
  }

  // .select() para saber si de verdad se actualizó una fila (si la clave no existiera, no tocaría nada).
  const { data, error } = await supabaseAdmin()
    .from('app_config')
    .update({ value: version, updated_at: new Date().toISOString() })
    .eq('key', 'min_version')
    .select('value');
  if (error) back({ error: error.message });
  if (!data?.length) back({ error: 'No existe la clave min_version en app_config, no se ha cambiado nada.' });

  revalidatePath('/versiones');
  back({ saved: version });
}
