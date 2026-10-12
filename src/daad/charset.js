// Conversión entre los códigos de carácter de DAAD y el texto Unicode del modelo.
//
// En el modelo los textos son cadenas JS normales. Los códigos de control de
// DAAD se guardan como caracteres de control con el mismo valor, salvo:
//   0x0D (fin de línea)    -> '\n'
//   0x7F (espacio duro)    -> ' '
//   16..31 (letras españolas) -> los caracteres Unicode correspondientes
// Así el texto se puede editar a mano y volver al DDB sin pérdidas.

export const ES = 'ª¡¿«»áéíóúñÑçÇüÜ';

export function daadToChar(c) {
  if (c >= 16 && c < 32) return ES[c - 16];
  if (c === 0x0d) return '\n';
  if (c === 0x7f) return ' ';
  return String.fromCharCode(c);
}

export function charToDaad(ch) {
  const i = ES.indexOf(ch);
  if (i >= 0) return 16 + i;
  if (ch === '\n') return 0x0d;
  if (ch === ' ') return 0x7f;
  const c = ch.charCodeAt(0);
  if (c < 128) return c;
  // Mayúsculas acentuadas: DAAD no las tiene, usamos la minúscula.
  const fold = { 'Á': 'á', 'É': 'é', 'Í': 'í', 'Ó': 'ó', 'Ú': 'ú' }[ch];
  if (fold) return charToDaad(fold);
  return '?'.charCodeAt(0);
}
