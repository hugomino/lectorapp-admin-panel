// Utilidades de ISBN para comparar el de la base de datos con el que figura en la ficha de Amazon.

function digitsOnly(value) {
  return (value || '').toString().replace(/[^0-9Xx]/g, '').toUpperCase();
}

function isValidIsbn10(code) {
  if (!/^\d{9}[\dX]$/.test(code)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) sum += (code[i] === 'X' ? 10 : Number(code[i])) * (10 - i);
  return sum % 11 === 0;
}

function isValidIsbn13(code) {
  if (!/^97[89]\d{10}$/.test(code)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(code[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10 === Number(code[12]);
}

function isbn10To13(code) {
  const body = `978${code.slice(0, 9)}`;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(body[i]) * (i % 2 === 0 ? 1 : 3);
  return `${body}${(10 - (sum % 10)) % 10}`;
}

// ISBN-13 normalizado (sin guiones) o null si no es un ISBN válido. Acepta ISBN-10 y lo convierte.
function toIsbn13(value) {
  const code = digitsOnly(value);
  if (isValidIsbn13(code)) return code;
  if (isValidIsbn10(code)) return isbn10To13(code);
  return null;
}

module.exports = { toIsbn13 };
