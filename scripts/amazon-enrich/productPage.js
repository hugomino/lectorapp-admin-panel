// Lee título, autor y portada de una ficha de producto de Amazon a partir del
// enlace que pega el admin (sigue los enlaces cortos amzn.to / link.amazon).
// Es el equivalente a lo que se saca de la tarjeta de la búsqueda por ISBN.
const { toHighResCover } = require('./coverUrl');

function clean(text) {
  const value = (text || '').replace(/\s+/g, ' ').trim();
  return value || null;
}

async function firstText(page, selectors) {
  for (const selector of selectors) {
    const text = await page.locator(selector).first().innerText({ timeout: 1500 }).catch(() => null);
    if (clean(text)) return clean(text);
  }
  return null;
}

async function firstAttr(page, selectors, attributes) {
  for (const selector of selectors) {
    for (const attribute of attributes) {
      const value = await page.locator(selector).first().getAttribute(attribute, { timeout: 1500 }).catch(() => null);
      if (value && value.startsWith('http')) return value;
    }
  }
  return null;
}

// "A", "A y B", "A, B y C" — mismo estilo que la tarjeta de búsqueda.
function joinNames(names) {
  if (names.length <= 1) return names[0] || null;
  return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;
}

async function readAuthors(page) {
  const links = await page
    .locator('#bylineInfo .author a.a-link-normal, #bylineInfo .author .a-link-normal')
    .allInnerTexts()
    .catch(() => []);
  const names = [...new Set(links.map(clean).filter(Boolean))];
  if (names.length) return joinNames(names);

  // Plan B: el texto entero de la línea de autor, sin "Visita la página de" ni "(Autor)".
  const line = await firstText(page, ['#bylineInfo']);
  if (!line) return null;
  return clean(line.replace(/visita la p[aá]gina de/gi, '').replace(/\([^)]*\)/g, '').replace(/,\s*$/, ''));
}

const CAPTCHA_ATTEMPTS = 3;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function hasCaptcha(page) {
  return (await page.locator('#captchacharacters, form[action*="validateCaptcha"]').count()) > 0;
}

// Devuelve { title, author, coverUrl } o { error } si no es una ficha de producto legible.
async function readProductPage(page, url) {
  // El captcha de Amazon es intermitente: se espera un poco más en cada reintento antes de rendirse.
  let blocked = true;
  for (let attempt = 1; attempt <= CAPTCHA_ATTEMPTS && blocked; attempt++) {
    if (attempt > 1) await sleep(8000 * (attempt - 1));
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    blocked = await hasCaptcha(page);
  }
  if (blocked) {
    return { error: 'Amazon pidió un captcha varias veces seguidas; se reintentará en la siguiente ejecución' };
  }

  // La ficha tarda un poco en pintar el título tras cargar.
  await page.locator('#productTitle, #ebooksProductTitle').first().waitFor({ timeout: 10000 }).catch(() => null);

  const title = await firstText(page, ['#productTitle', '#ebooksProductTitle']);
  if (!title) return { error: 'el enlace no lleva a una ficha de producto de Amazon (no se encontró el título)' };

  const author = await readAuthors(page);
  const rawCover = await firstAttr(
    page,
    ['#landingImage', '#imgBlkFront', '#ebooksImgBlkFront', '#main-image'],
    ['data-old-hires', 'src']
  );

  return { title, author, coverUrl: toHighResCover(rawCover), finalUrl: page.url() };
}

module.exports = { readProductPage };
