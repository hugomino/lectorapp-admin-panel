// Cookie de sesión firmada con HMAC-SHA256, sin tabla de sesiones ni Supabase
// Auth: solo hay una contraseña compartida (ADMIN_PANEL_PASSWORD). Usa Web
// Crypto (crypto.subtle) para funcionar igual en middleware (Edge runtime) y
// en route handlers (Node runtime).

const SESSION_COOKIE = 'admin_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 días

function toBase64Url(bytes) {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/').padEnd(str.length + ((4 - (str.length % 4)) % 4), '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hmac(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return toBase64Url(new Uint8Array(signature));
}

export async function createSessionToken(secret) {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const signature = await hmac(secret, String(expiresAt));
  return `${expiresAt}.${signature}`;
}

export async function verifySessionToken(token, secret) {
  if (!token) return false;
  const [expiresAtStr, signature] = token.split('.');
  if (!expiresAtStr || !signature) return false;
  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;

  const expectedSignature = await hmac(secret, expiresAtStr);
  const a = fromBase64Url(signature);
  const b = fromBase64Url(expectedSignature);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export { SESSION_COOKIE, SESSION_TTL_MS };
