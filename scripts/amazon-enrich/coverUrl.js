// Las URLs de imágenes de Amazon llevan un modificador de tamaño antes de la
// extensión (p. ej. "._AC_UL320_.jpg" = miniatura de 320 px de alto). La página
// de resultados de búsqueda siempre sirve esa miniatura. Quitándolo, o
// sustituyéndolo, Amazon devuelve la imagen grande del mismo recurso.
//
// "_SL1500_" limita el lado largo a 1500 px: nítido en cualquier móvil y sin
// bajar el original completo (que a veces pesa varios MB). Nunca amplía: si el
// original es más pequeño, devuelve el original.
const HIGH_RES_MODIFIER = '_SL1500_';

const AMAZON_IMAGE_HOST = /^https:\/\/(m\.media-amazon\.com|images-[a-z]+\.ssl-images-amazon\.com)\//;
const SIZE_MODIFIER = /\._[^/]*_\.(jpe?g|png|webp)$/i;

function toHighResCover(url) {
  if (!url || !AMAZON_IMAGE_HOST.test(url)) return url;
  if (!SIZE_MODIFIER.test(url)) return url;
  return url.replace(SIZE_MODIFIER, `.${HIGH_RES_MODIFIER}.$1`);
}

module.exports = { toHighResCover };
