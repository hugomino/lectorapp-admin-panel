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

    return { asin: asin.toUpperCase(), coverUrl };
  }

  return null;
}

async function enrichBook(page, book) {
  const isbn = book.isbn13 || book.isbn;
  if (!isbn) {
    return { skipped: true, reason: 'sin ISBN' };
  }

  await page.goto(`https://www.amazon.es/s?k=${encodeURIComponent(isbn)}`, {
    waitUntil: 'domcontentloaded',
    timeout: 20000,
  });
  await dismissCookieBanner(page);

  const result = await findFirstOrganicResult(page);
  if (!result || !result.asin) {
    return { failed: true, reason: 'sin resultado no patrocinado con ASIN' };
  }

  const affiliateUrl = `https://www.amazon.es/dp/${result.asin}?tag=${AFFILIATE_TAG}`;

  const { error } = await supabase
    .from('books')
    .update({
      affiliate_url: affiliateUrl,
      amazon_cover_url: result.coverUrl || null,
    })
    .eq('id', book.id);

  if (error) {
    return { failed: true, reason: `error de Supabase: ${error.message}` };
  }

  return { updated: true, affiliateUrl };
}

async function main() {
  const { data: books, error } = await supabase
    .from('books')
    .select('id, title, isbn, isbn13')
    .is('affiliate_url', null)
    .order('id', { ascending: true });

  if (error) {
    console.error('No se pudo leer books:', error.message);
    process.exit(1);
  }

  console.log(`${books.length} libros sin affiliate_url.`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    locale: 'es-ES',
    timezoneId: 'Europe/Madrid',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();

  const failures = [];
  let updatedCount = 0;
  let skippedCount = 0;

  for (let i = 0; i < books.length; i++) {
    const book = books[i];
    const label = `#${book.id} "${book.title}"`;

    try {
      const outcome = await enrichBook(page, book);
      if (outcome.skipped) {
        skippedCount++;
        console.log(`- ${label}: omitido (${outcome.reason})`);
      } else if (outcome.failed) {
        failures.push({ book, reason: outcome.reason });
        console.log(`x ${label}: fallo (${outcome.reason})`);
      } else {
        updatedCount++;
        console.log(`✓ ${label}: ${outcome.affiliateUrl}`);
      }
    } catch (err) {
      failures.push({ book, reason: err.message });
      console.log(`x ${label}: excepción (${err.message})`);
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
}

main();
