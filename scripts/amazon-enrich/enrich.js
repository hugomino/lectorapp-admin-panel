// Script local, NO se despliega. Rellena books.affiliate_url y
// books.amazon_cover_url buscando cada ISBN en amazon.es con Playwright.
// Uso: npm install && npx playwright install chromium && npm run enrich

require('dotenv').config();
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const { toHighResCover } = require('./coverUrl');
const { readProductPage } = require('./productPage');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const AFFILIATE_TAG = process.env.AMAZON_AFFILIATE_TAG;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !AFFILIATE_TAG) {
  console.error('Faltan variables de entorno. Copia .env.example a .env y rellénalo.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// --if-pending: usado por la tarea programada de Windows (cada 5 min). Solo
// hace algo si el panel ha marcado status='pending'. Sin el flag (ej. `npm
// run enrich` a mano) siempre corre, y actualiza igualmente el estado para
// que la pestaña Amazon del panel refleje también las ejecuciones manuales.
const RUN_ONLY_IF_PENDING = process.argv.includes('--if-pending');

// Un 'running' más viejo que esto se considera muerto (la tarea de Windows
// mata el proceso a los 30 min).
const STALE_RUNNING_MS = 35 * 60 * 1000;

function randomDelayMs() {
  return 2000 + Math.floor(Math.random() * 3000);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function dismissCookieBanner(page) {
  try {
    const acceptButton = page.locator('#sp-cc-accept');
    if (await acceptButton.isVisible({ timeout: 3000 })) {
      await acceptButton.click();
    }
  } catch {
    // No apareció el banner de cookies, seguimos.
  }
}

async function findFirstOrganicResult(page) {
  const cards = page.locator('div[data-component-type="s-search-result"]');
  const count = await cards.count();

  for (let i = 0; i < count; i++) {
    const card = cards.nth(i);
    const text = (await card.innerText().catch(() => '')) || '';
    if (/patrocinado|sponsored/i.test(text)) continue;

    let asin = await card.getAttribute('data-asin').catch(() => null);
    if (!asin) {
      const href = await card.locator('a[href*="/dp/"]').first().getAttribute('href').catch(() => null);
      const match = href ? href.match(/\/dp\/([A-Z0-9]{10})/i) : null;
      asin = match ? match[1] : null;
    }
    if (!asin) continue;

    // El src de la búsqueda es una miniatura de 320 px; se pide la versión grande.
    const thumbUrl = await card.locator('img.s-image').first().getAttribute('src').catch(() => null);
    const coverUrl = toHighResCover(thumbUrl);
    const title = await card.locator('h2').first().getAttribute('aria-label').catch(() => null);
    const authorRow = await card
      .locator('[data-cy="title-recipe"] .a-color-secondary')
      .first()
      .innerText()
      .catch(() => null);
    const author = authorRow ? authorRow.replace(/^de\s+/i, '').trim() || null : null;

    return { asin: asin.toUpperCase(), coverUrl, title, author };
  }

  return null;
}

const SEARCH_ATTEMPTS = 3;
const CARDS = 'div[data-component-type="s-search-result"]';
const NO_RESULTS = ':text-matches("No hay resultados|no ha coincidido", "i")';

// Amazon a veces devuelve su página de error ("Lo sentimos.") o un captcha, sobre todo en las primeras
// peticiones de una sesión nueva. Eso NO significa que el libro no exista, así que solo se da por
// "no encontrado" con prueba positiva (mensaje de sin resultados, o tarjetas que son todas patrocinadas)
// y, si Amazon falla, se reintenta con esperas antes de rendirse.
// Devuelve { result } | { empty: true } | { blocked: true }.
async function searchByIsbn(page, isbn) {
  for (let attempt = 1; attempt <= SEARCH_ATTEMPTS; attempt++) {
    if (attempt > 1) await sleep(8000 * (attempt - 1));

    await page.goto(`https://www.amazon.es/s?k=${encodeURIComponent(isbn)}`, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    });
    await dismissCookieBanner(page);
    await page.locator(`${CARDS}, ${NO_RESULTS}`).first().waitFor({ timeout: 8000 }).catch(() => null);

    const result = await findFirstOrganicResult(page);
    if (result && result.asin) return { result };

    if ((await page.locator(CARDS).count()) > 0) return { empty: true }; // solo patrocinados
    if ((await page.locator(NO_RESULTS).count()) > 0) return { empty: true }; // mensaje explícito
    // Ni resultados ni "sin resultados": página de error o captcha -> reintentar.
  }
  return { blocked: true };
}

async function enrichBook(page, book) {
  const isbn = book.isbn13 || book.isbn;
  if (!isbn) {
    // Permanente: sin ISBN nunca se va a poder buscar, da igual cuántas veces se reintente.
    return { skipped: true, permanent: true, reason: 'sin ISBN' };
  }

  const search = await searchByIsbn(page, isbn);

  if (search.blocked) {
    // No permanente: el libro puede existir; Amazon no respondió bien. Se reintenta en el siguiente run.
    return { failed: true, permanent: false, reason: 'Amazon no respondió bien (página de error o captcha)' };
  }
  if (search.empty) {
    // Permanente: Amazon tiene la búsqueda vacía para ese ISBN — no va a cambiar de un run a otro,
    // mejor pedir el link a mano.
    return { failed: true, permanent: true, reason: 'Amazon no tiene ese ISBN (sin resultados)' };
  }
  const { result } = search;

  const affiliateUrl = `https://www.amazon.es/dp/${result.asin}?tag=${AFFILIATE_TAG}`;

  const { error } = await supabase
    .from('books')
    .update({
      affiliate_url: affiliateUrl,
      amazon_cover_url: result.coverUrl || null,
      amazon_title: result.title || null,
      amazon_author: result.author || null,
    })
    .eq('id', book.id);

  if (error) {
    // No permanente: se encontró el libro en Amazon, solo falló al guardar
    // en Supabase — vale la pena reintentar en el siguiente run.
    return { failed: true, permanent: false, reason: `error de Supabase: ${error.message}` };
  }

  return { updated: true, affiliateUrl };
}

// Libros con enlace pegado a mano por el admin (porque el ISBN estaba mal o Amazon no lo encontraba):
// en vez de buscar por ISBN se abre ese enlace y se lee de su ficha. El enlace de afiliado no se toca.
async function enrichBookFromLink(page, book) {
  const result = await readProductPage(page, book.affiliate_url);
  if (result.error) {
    // No permanente: el admin puede corregir el enlace, o el captcha puede ser puntual.
    return { failed: true, permanent: false, reason: result.error };
  }

  const { error } = await supabase
    .from('books')
    .update({
      amazon_cover_url: result.coverUrl || null,
      amazon_title: result.title,
      amazon_author: result.author || null,
    })
    .eq('id', book.id);
  if (error) return { failed: true, permanent: false, reason: `error de Supabase: ${error.message}` };

  return { updated: true, affiliateUrl: book.affiliate_url };
}

async function markLookupFailed(bookId) {
  const { error } = await supabase.from('books').update({ amazon_lookup_failed: true }).eq('id', bookId);
  if (error) console.error(`No se pudo marcar amazon_lookup_failed en #${bookId}:`, error.message);
}

async function shouldRun() {
  if (!RUN_ONLY_IF_PENDING) return true;

  const { data, error } = await supabase
    .from('amazon_enrich_status')
    .select('status, started_at')
    .eq('id', 1)
    .single();
  if (error) {
    console.error('No se pudo leer amazon_enrich_status:', error.message);
    return false;
  }
  if (data?.status === 'pending') return true;

  // 'running' caducado: un run anterior murió sin pasar por finally (proceso
  // matado, apagado del PC, límite de tiempo de la tarea). Se recupera para
  // que el panel no se quede bloqueado para siempre. La tarea usa
  // MultipleInstances=IgnoreNew, así que no hay riesgo de pisar un run vivo.
  if (data?.status === 'running' && isStale(data.started_at)) {
    console.log('Estado "running" caducado, se recupera y se relanza.');
    return true;
  }
  return false;
}

function isStale(startedAt) {
  return !startedAt || Date.now() - new Date(startedAt).getTime() > STALE_RUNNING_MS;
}

async function markRunning() {
  await supabase
    .from('amazon_enrich_status')
    .update({ status: 'running', started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', 1);
}

async function markFinished({ updatedCount, failures }) {
  await supabase
    .from('amazon_enrich_status')
    .update({
      status: 'idle',
      finished_at: new Date().toISOString(),
      updated_count: updatedCount,
      failed_count: failures.length,
      failure_details: failures.map((f) => ({ book_id: f.book.id, title: f.book.title, reason: f.reason })),
      updated_at: new Date().toISOString(),
    })
    .eq('id', 1);
}

async function main() {
  if (!(await shouldRun())) {
    console.log('Nada pendiente en amazon_enrich_status, no hay nada que hacer.');
    return;
  }

  await markRunning();

  const failures = [];
  let updatedCount = 0;

  try {
    const { data: books, error } = await supabase
      .from('books')
      .select('id, title, isbn, isbn13')
      .or('affiliate_url.is.null,amazon_title.is.null')
      .eq('amazon_lookup_failed', false)
      .order('id', { ascending: true });

    if (error) {
      console.error('No se pudo leer books:', error.message);
      process.exitCode = 1;
      return;
    }

    // Pendientes de verificar con enlace manual y sin datos de Amazon todavía (amazon_lookup_failed = true
    // los deja fuera de la búsqueda por ISBN de arriba, y el panel los oculta de Verificación hasta aquí).
    const { data: linkBooks, error: linkError } = await supabase
      .from('books')
      .select('id, title, affiliate_url')
      .eq('amazon_lookup_failed', true)
      .not('affiliate_url', 'is', null)
      .is('amazon_title', null)
      .is('confirmed', null)
      .order('id', { ascending: true });

    if (linkError) {
      console.error('No se pudo leer books con enlace manual:', linkError.message);
      process.exitCode = 1;
      return;
    }

    console.log(`${linkBooks.length} libros con enlace manual por leer.`);
    console.log(`${books.length} libros sin affiliate_url o sin título/autor de Amazon.`);

    // Primero los de enlace manual (el admin está esperando a poder verificarlos).
    const tasks = [
      ...linkBooks.map((book) => ({ book, mode: 'link' })),
      ...books.map((book) => ({ book, mode: 'isbn' })),
    ];

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      locale: 'es-ES',
      timezoneId: 'Europe/Madrid',
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
    });
    const page = await context.newPage();

    // Calentamiento: las primeras peticiones de una sesión nueva son las que Amazon más bloquea.
    // Se entra primero en la portada y se aceptan las cookies, como haría una persona.
    try {
      await page.goto('https://www.amazon.es/', { waitUntil: 'domcontentloaded', timeout: 20000 });
      await dismissCookieBanner(page);
    } catch {
      // Si falla el calentamiento no pasa nada: los reintentos de cada búsqueda lo cubren.
    }

    let skippedCount = 0;

    for (let i = 0; i < tasks.length; i++) {
      const { book, mode } = tasks[i];
      const label = `#${book.id} "${book.title}"${mode === 'link' ? ' (enlace manual)' : ''}`;

      try {
        const outcome = mode === 'link' ? await enrichBookFromLink(page, book) : await enrichBook(page, book);
        if (outcome.skipped) {
          skippedCount++;
          const suffix = outcome.permanent ? ', pasa a manual' : '';
          console.log(`- ${label}: omitido${suffix} (${outcome.reason})`);
          if (outcome.permanent) await markLookupFailed(book.id);
        } else if (outcome.failed) {
          failures.push({ book, reason: outcome.reason });
          const suffix = outcome.permanent ? ', pasa a manual' : ', se reintentará';
          console.log(`x ${label}: fallo${suffix} (${outcome.reason})`);
          if (outcome.permanent) await markLookupFailed(book.id);
        } else {
          updatedCount++;
          console.log(`✓ ${label}: ${outcome.affiliateUrl}`);
        }
      } catch (err) {
        // Excepción no controlada (timeout de red, etc.) — no se marca
        // permanente, se reintenta en el siguiente run por si fue puntual.
        failures.push({ book, reason: err.message });
        console.log(`x ${label}: excepción, se reintentará (${err.message})`);
      }

      if (i < tasks.length - 1) {
        await sleep(randomDelayMs());
      }
    }

    await browser.close();

    console.log('\n--- Resumen ---');
    console.log(`Actualizados: ${updatedCount}`);
    console.log(`Omitidos (sin ISBN): ${skippedCount}`);
    console.log(`Fallidos: ${failures.length}`);
    for (const f of failures) {
      console.log(`  - #${f.book.id} "${f.book.title}": ${f.reason}`);
    }
  } finally {
    await markFinished({ updatedCount, failures });
  }
}

main();
