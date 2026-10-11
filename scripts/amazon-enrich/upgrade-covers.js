// Script local, NO se despliega. Sustituye las portadas de Amazon guardadas en
// baja resolución (miniaturas "._AC_UL320_") por su versión grande.
//
// Por defecto es un ensayo: comprueba cada URL nueva contra Amazon y muestra
// qué cambiaría, sin escribir nada. Para aplicar los cambios: --apply
//
// Qué toca, por libro:
//   - books.amazon_cover_url  -> versión grande
//   - books.cover_url         -> versión grande, SOLO si cover_source = 'amazon'
//                                y cover_url era igual a la miniatura.
// Las portadas propias (open_library / subidas) no se tocan.
//
// Uso: npm run upgrade-covers            (ensayo)
//      npm run upgrade-covers -- --apply (escribe en Supabase)

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { toHighResCover } = require('./coverUrl');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Copia .env.example a .env y rellénalo.');
  process.exit(1);
}

const APPLY = process.argv.includes('--apply');
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Descarga la imagen y devuelve su peso en bytes, o null si no es una imagen válida.
async function imageBytes(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) return null;
  if (!(res.headers.get('content-type') || '').startsWith('image/')) return null;
  return (await res.arrayBuffer()).byteLength;
}

async function main() {
  const { data: books, error } = await supabase
    .from('books')
    .select('id, title, cover_url, cover_source, amazon_cover_url')
    .not('amazon_cover_url', 'is', null)
    .order('id', { ascending: true });
  if (error) {
    console.error('No se pudo leer books:', error.message);
    process.exit(1);
  }

  console.log(`${APPLY ? 'APLICANDO' : 'ENSAYO (no escribe)'} — ${books.length} libros con portada de Amazon.\n`);

  let upgraded = 0;
  let unchanged = 0;
  const problems = [];

  for (const book of books) {
    const label = `#${book.id} "${book.title}"`;
    const oldUrl = book.amazon_cover_url;
    const newUrl = toHighResCover(oldUrl);

    if (newUrl === oldUrl) {
      unchanged++;
      console.log(`= ${label}: ya está en alta resolución o no es una URL de Amazon`);
      continue;
    }

    let oldBytes;
    let newBytes;
    try {
      [oldBytes, newBytes] = [await imageBytes(oldUrl), await imageBytes(newUrl)];
    } catch (err) {
      problems.push(`${label}: ${err.message}`);
      console.log(`x ${label}: error de red (${err.message}), se deja como estaba`);
      continue;
    }

    // Solo se sustituye si la versión grande existe y pesa más que la miniatura.
    if (!newBytes || (oldBytes && newBytes <= oldBytes)) {
      problems.push(`${label}: la versión grande no es válida o no es mayor`);
      console.log(`x ${label}: la versión grande no es válida o no es mayor, se deja como estaba`);
      continue;
    }

    const updates = { amazon_cover_url: newUrl };
    const coverIsAmazonThumb = book.cover_source === 'amazon' && book.cover_url === oldUrl;
    if (coverIsAmazonThumb) updates.cover_url = newUrl;

    const sizes = `${Math.round((oldBytes || 0) / 1024)} KB -> ${Math.round(newBytes / 1024)} KB`;

    if (APPLY) {
      const { error: updateError } = await supabase.from('books').update(updates).eq('id', book.id);
      if (updateError) {
        problems.push(`${label}: ${updateError.message}`);
        console.log(`x ${label}: error de Supabase (${updateError.message})`);
        continue;
      }
    }

    upgraded++;
    console.log(`✓ ${label}: ${sizes}${coverIsAmazonThumb ? ' (portada activa también actualizada)' : ''}`);
    await sleep(300);
  }

  console.log('\n--- Resumen ---');
  console.log(`${APPLY ? 'Actualizados' : 'Se actualizarían'}: ${upgraded}`);
  console.log(`Sin cambios: ${unchanged}`);
  console.log(`Con problema (no tocados): ${problems.length}`);
  for (const p of problems) console.log(`  - ${p}`);
  if (!APPLY && upgraded > 0) console.log('\nPara aplicar: npm run upgrade-covers -- --apply');
}

main();
