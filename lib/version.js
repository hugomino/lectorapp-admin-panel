// Versiones con formato X.Y.Z (el "nombre de versión" de Google Play, p. ej. 1.3.0).
const VERSION_RE = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/;

export function isValidVersion(value) {
  return VERSION_RE.test(value);
}

// <0 si a < b, 0 si son iguales, >0 si a > b.
export function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}
