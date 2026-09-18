// Script local, NO se despliega. Rellena books.affiliate_url y
// books.amazon_cover_url buscando cada ISBN en amazon.es con Playwright.
// Uso: npm install && npx playwright install chromium && npm run enrich

require('dotenv').config();
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');

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

// --if-pending: usado por la tarea programada de Windows (cada 4h). Solo
// hace algo si el panel ha marcado status='pending'. Sin el flag (ej. `npm
// run enrich` a mano) siempre corre, y actualiza igualmente el estado para
// que la pestaña Amazon del panel refleje también las ejecuciones manuales.
const RUN_ONLY_IF_PENDING = process.argv.includes('--if-pending');

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

    const coverUrl = await card.locator('img.s-image').first().getAttribute('src').catch(() => null);
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

async function enrichBook(page, book) {
  const isbn = book.isbn13 || book.isbn;
  if (!isbn) {
    // Permanente: sin ISBN nunca se va a poder buscar, da igual cuántas veces se reintente.
    return { skipped: true, permanent: true, reason: 'sin ISBN' };
  }

  await page.goto(`https://www.amazon.es/s?k=${encodeURIComponent(isbn)}`, {
    waitUntil: 'domcontentloaded',
    timeout: 20000,
  });
  await dismissCookieBanner(page);

  const result = await findFirstOrganicResult(page);
  if (!result || !result.asin) {
    // Permanente: Amazon no tiene ese ISBN (o solo hay patrocinados) — no va
    // a cambiar de un run a otro, mejor pedir el link a mano.
    return { failed: true, permanent: true, reason: 'sin resultado no patrocinado con ASIN' };
  }

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

async function markLookupFailed(bookId) {
  const { error } = await supabase.from('books').update({ amazon_lookup_failed: true }).eq('id', bookId);
  if (error) console.error(`No se pudo marcar amazon_lookup_failed en #${bookId}:`, error.message);
}

async function shouldRun() {
  if (!RUN_ONLY_IF_PENDING) return true;

  const { data, error } = await supabase.from('amazon_enrich_status').select('status').eq('id', 1).single();
  if (error) {
    console.error('No se pudo leer amazon_enrich_status:', error.message);
    return false;
  }
  return data?.status === 'pending';
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

    console.log(`${books.length} libros sin affiliate_url o sin título/autor de Amazon.`);

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      locale: 'es-ES',
      timezoneId: 'Europe/Madrid',
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
    });
    const page = await context.newPage();

    let skippedCount = 0;

    for (let i = 0; i < books.length; i++) {
      const book = books[i];
      const label = `#${book.id} "${book.title}"`;

      try {
        const outcome = await enrichBook(page, book);
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

      if (i < books.length - 1) {
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
