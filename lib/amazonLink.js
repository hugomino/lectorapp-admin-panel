import { supabaseAdmin } from '@/lib/supabaseAdmin';

// amazon.es / amazon.com / amazon.co.uk…, enlaces cortos de afiliado (amzn.to, amzn.eu, a.co, link.amazon).
const AMAZON_HOST = /(^|\.)(amazon\.[a-z.]{2,6}|amzn\.(to|eu|com)|a\.co|link\.amazon)$/i;

export function parseAmazonLink(raw) {
  const value = (raw || '').toString().trim();
  if (!value) return { error: 'Pega el enlace de Amazon del libro.' };

  let url;
  try {
    url = new URL(value);
  } catch {
    return { error: 'Eso no es un enlace válido. Pega la dirección completa, empezando por https://' };
  }
  if (!['http:', 'https:'].includes(url.protocol) || !AMAZON_HOST.test(url.hostname)) {
    return { error: 'Ese enlace no parece de Amazon (amazon.es, amzn.to, link.amazon…).' };
  }
  return { url: value };
}

// Guarda el enlace que pega el admin y deja el libro "a la espera del proceso": se borran los datos de Amazon
// anteriores (pueden ser de otro libro por un ISBN equivocado) y amazon_lookup_failed = true lo saca de la búsqueda
// por ISBN y de Verificación. El proceso leerá el enlace y, al traer los datos, el libro volverá a Verificación.
export async function saveManualAmazonLink(bookId, raw) {
  const parsed = parseAmazonLink(raw);
  if (parsed.error) return { error: parsed.error };

  const { data, error } = await supabaseAdmin()
    .from('books')
    .update({
      affiliate_url: parsed.url,
      amazon_title: null,
      amazon_author: null,
      amazon_cover_url: null,
      amazon_lookup_failed: true,
    })
    .eq('id', bookId)
    .select('id');
  if (error) return { error: error.message };
  if (!data?.length) return { error: 'No se encontró el libro, no se ha guardado nada.' };
  return { ok: true };
}
