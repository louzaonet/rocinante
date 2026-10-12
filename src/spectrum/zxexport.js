// Montaje de partidas DAAD para Spectrum: base de gráficos (SDG) e
// instantáneas .z80 de 48K y 128K listas para cargar en un emulador.

import { BASES, DAAD_CHARSET } from './daadbase.js';
import { writeZ80 } from './z80snap.js';
import { t } from '../i18n.js';

const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export const defaultCharset = () => fromB64(DAAD_CHARSET);

// Base de gráficos (SDG). Se carga de forma que termine en FFFFh.
// pictures: [{ data: bytes de la cadena de dibujo (acabada en END),
//              location: true si es dibujo de localidad (no subrutina),
//              paper, ink, line, col, height, width }]
// Estructura (la misma que deja el editor DG):
//   datos de los dibujos
//   tabla de punteros: un puntero por dibujo, el de fin de datos y FFFFh
//   tabla de ventanas: 5 bytes por dibujo y FFh
//   juego de caracteres (2048 bytes)
//   FFE4h: 0, tabla de colores 0..7, 2 bytes libres
//   FFEFh: punteros a datos, punteros, ventanas, fin, juego de caracteres,
//          tabla de colores (-1), FFFFh, nº de dibujos, 0, 0
// DAAD escribe a 42 columnas: de cada carácter solo se ven los 6 puntos de la
// izquierda. Las fuentes de 32 columnas (las de PAW, por ejemplo) suelen dejar
// libre la columna izquierda y usar las dos de la derecha, y entonces la m
// parece una r. En ese caso las letras (16 a 127) se corren un punto a la
// izquierda. Devuelve true si lo ha hecho.
export function fitFont42(cs) {
  let n = 0, left = 0, right = 0;
  for (let c = 33; c < 127; c++) {
    const g = cs.subarray(c * 8, c * 8 + 8);
    if (!g.some(Boolean)) continue;
    n++;
    if (g.some((b) => b & 0x80)) left++;
    if (g.some((b) => b & 3)) right++;
  }
  if (!n || left > n * 0.1 || right < n * 0.2) return false;
  for (let i = 16 * 8; i < 128 * 8; i++) cs[i] = (cs[i] << 1) & 255;
  return true;
}

// min: dirección más baja en la que puede empezar (lo que deje el DDB)
export function buildSDG(pictures = [], charset = defaultCharset(), min = 0xc000) {
  if (!pictures.length) pictures = [{ data: [7], location: false, paper: 0, ink: 7, line: 0, col: 0, height: 12, width: 42 }];
  // Los dibujos iguales (el mismo en varias localidades) comparten los datos
  const firstOf = new Map();
  const shared = pictures.map((p, i) => { const k = p.data.join(','); if (!firstOf.has(k)) firstOf.set(k, i); return firstOf.get(k); });
  const dataLen = pictures.reduce((a, p, i) => a + (shared[i] === i ? p.data.length : 0), 0);
  const ptrLen = 2 * (pictures.length + 2);
  const winLen = 5 * pictures.length + 1;
  const size = dataLen + ptrLen + winLen + 2048 + 28;
  const start = 0x10000 - size;
  if (start < min) throw new Error(t('La base de gráficos es demasiado grande'));
  const b = new Uint8Array(size);
  const at = (addr) => addr - start;
  const w16 = (addr, v) => { b[at(addr)] = v & 255; b[at(addr) + 1] = v >> 8; };
  let a = start;
  const ptrs = [];
  pictures.forEach((p, i) => {
    if (shared[i] !== i) { ptrs.push(ptrs[shared[i]]); return; }
    ptrs.push(a); b.set(p.data, at(a)); a += p.data.length;
  });
  const ptrTable = a;
  for (const p of ptrs) { w16(a, p); a += 2; }
  w16(a, ptrTable); a += 2;            // fin de los datos
  w16(a, 0xffff); a += 2;
  const winTable = a;
  for (const p of pictures) {
    b[at(a)] = (p.location ? 0x80 : 0) | ((p.paper & 7) << 3) | (p.ink & 7);
    b[at(a) + 1] = p.line; b[at(a) + 2] = p.col; b[at(a) + 3] = p.height; b[at(a) + 4] = p.width;
    a += 5;
  }
  const winEnd = a;
  b[at(a)] = 0xff; a += 1;
  const cs = a;
  b.set(charset, at(a)); a += 2048;
  if (a !== 0xffe4) throw new Error('SDG mal calculado');
  b[at(0xffe4)] = 0;
  for (let i = 0; i < 8; i++) b[at(0xffe5 + i)] = i;
  w16(0xffef, start);
  w16(0xfff1, ptrTable);
  w16(0xfff3, winTable);
  w16(0xfff5, winEnd);
  w16(0xfff7, cs);
  w16(0xfff9, 0xffe4);
  w16(0xfffb, 0xffff);
  b[at(0xfffd)] = pictures.length;
  return b;
}

// Intérprete según el idioma del juego: DS48IS (es) o DS48IE (en)
const base = (lang) => BASES[lang === 'en' ? 'en' : 'es'];

// Instantánea de 48K: intérprete + DDB en 8400h + SDG al final de la memoria.
export function snapshot48(ddb, sdg = buildSDG(), lang = 'es') {
  const BASE48 = base(lang).b48;
  const ram = new Uint8Array(0xc000);          // 4000h..FFFFh
  ram.set(fromB64(BASE48.data), BASE48.from - 0x4000);
  const sdgStart = 0x10000 - sdg.length;
  if (0x8400 + ddb.length > sdgStart) throw new Error(t('No cabe en 48K: faltan {n} bytes. Exporta para 128K.', { n: 0x8400 + ddb.length - sdgStart }));
  ram.set(ddb, 0x8400 - 0x4000);
  ram.set(sdg, sdgStart - 0x4000);
  return writeZ80({ machine: '48', regs: BASE48.regs, border: 0, ram48: ram });
}

// Instantánea de 128K. banks: { n: Uint8Array } con los datos de los bancos.
export function snapshot128(ddb, sdg = buildSDG(), banks = {}, lang = 'es') {
  const BASE128 = base(lang).b128;
  const B = Array.from({ length: 8 }, () => new Uint8Array(0x4000));
  B[5].set(fromB64(BASE128.bank5), 0x1800);
  B[2].set(fromB64(BASE128.bank2), 0);
  B[7].set(fromB64(BASE128.bank7), BASE128.bank7from);
  // DDB desde 8400h: 8400h-BFFFh en el banco 2, el resto en el banco 0
  const sdgStart = 0x10000 - sdg.length;
  if (0x8400 + ddb.length > sdgStart) throw new Error(t('No cabe: faltan {n} bytes', { n: 0x8400 + ddb.length - sdgStart }));
  const put = (addr, bytes) => {
    for (let i = 0; i < bytes.length; i++) {
      const x = addr + i;
      if (x < 0xc000) B[2][x - 0x8000] = bytes[i]; else B[0][x - 0xc000] = bytes[i];
    }
  };
  put(0x8400, ddb);
  put(sdgStart, sdg);
  for (const [n, data] of Object.entries(banks)) {
    if (['0', '2', '5'].includes(String(n))) throw new Error(t('El banco {n} no se puede usar para datos', { n }));
    B[n].set(data, 0);
  }
  return writeZ80({ machine: '128', regs: BASE128.regs, border: 0, out7ffd: BASE128.out7ffd, banks: B });
}
