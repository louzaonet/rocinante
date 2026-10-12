// Base de gráficos de DAAD para Commodore 64 a partir de los dibujos
// vectoriales del Spectrum.
//
// El C64 de DAAD pinta en alta resolución (320x200) con tinta y papel por
// cuadro de 8x8, igual que el Spectrum, así que cada orden pasa casi tal cual.
// Byte de orden (sacado de la tabla de órdenes del intérprete, sdi64 2B9Dh):
//   bits 0-2 = orden
//   0 INK v       v en los bits 3-7: color del C64 (0-15) o 16 = transparente
//   1 PAPER v
//   2 END         (o vuelta de un GOSUB)
//   3 GOSUB n     escala en los bits 3-5; espejo: bit 7 en x, bit 6 en y
//   4 PLOT x y    3 bytes; bit 3 = 9º bit de x; y desde arriba
//   5 LINE dx dy  3 bytes, relativa; bit 5 = dx hacia la izquierda, bit 4 =
//                 dy hacia arriba, bit 3 = 9º bit de dx
//   6 FILL dx dy  3 bytes; con el bit 7, SHADE dx dy c (4 bytes, bit 6 = trama
//                 invertida)
//   7 TEXT fila col c  4 bytes (bit 7 a 0; modo en los bits 6 y 5)
//     BLOCK fila col alto ancho  5 bytes (bit 7 a 1): solo colores
// PLOT y LINE: bit 7 = OVER, bit 6 = INVERSE, los dos = mover sin pintar.
//
// Estructura (se carga para que acabe en CC00h; el juego de caracteres, que
// también es el de las tramas, va siempre en C3DCh):
//   órdenes de los dibujos
//   tabla de punteros: uno por dibujo, el de esa tabla y FFFFh
//   ventanas: 6 bytes por dibujo (bit 7 del primero = subdibujo; colores tinta
//   y papel; línea, columna, alto y ancho en columnas de 40) y FFh
//   C3DCh: juego de caracteres (2048 bytes)
//   CBDCh: 0 y los 16 colores de INK/PAPER del texto   CBEDh: 0, 52h
//   CBEFh: punteros a datos, punteros, ventanas, fin de ventanas, caracteres,
//          CBDCh, FFFFh, nº de dibujos, 0, 0
//
// Del Spectrum al C64: el dibujo queda centrado (x + 32, 4 columnas más) y la y
// cuenta desde arriba (175 - y). Los colores salen de la tinta o el papel y del
// BRIGHT (los colores claros del C64); FLASH no existe.

import { Painter } from '../gfx/drawstring.js';

export const C64_END = 0xcc00;
const CHARSET_AT = 0xc3dc, COLOURS_AT = 0xcbdc, PTRS_AT = 0xcbef;
const X0 = 32, COL0 = 4;

// Colores del Spectrum en el C64: normal y BRIGHT
const ZX2C64 = [[0, 6, 2, 4, 5, 3, 7, 1], [0, 14, 10, 4, 13, 3, 7, 1]];
// Tabla de colores de INK y PAPER del texto: con la numeración del Spectrum,
// como hace el conversor DSC de DAAD, para que los juegos se vean igual
const TEXT_COLOURS = [0, 6, 2, 4, 5, 3, 7, 1, 8, 9, 10, 11, 12, 13, 14, 15];

// Colores del C64 (paleta de VICE, "Pepto"), para los avances del editor
export const C64_RGB = [[0, 0, 0], [255, 255, 255], [104, 55, 43], [112, 164, 178], [111, 61, 134], [88, 141, 67], [53, 40, 121], [184, 199, 111],
  [111, 79, 37], [67, 57, 0], [154, 103, 89], [68, 68, 68], [108, 108, 108], [154, 210, 132], [108, 94, 181], [149, 149, 149]];

const zxColour = (v, bright) => (v < 8 ? ZX2C64[bright ? 1 : 0][v] : 16);

// Traduce una cadena del Spectrum. charMap: carácter de trama del Spectrum ->
// carácter del C64. x0, col0: desplazamiento (el dibujo va centrado); skip:
// posiciones de rellenos que se quitan. Devuelve los bytes (acaban en END).
export function convertDrawstring(d, charMap = (c) => c, { x0 = X0, col0 = COL0, skip = null, colours = null } = {}) {
  const out = [];
  // Estado del Spectrum (null: lo que viniera de antes) y lo último que se ha
  // mandado al C64 (undefined: no se sabe). Los colores se mandan justo antes
  // de pintar, así que INK/PAPER/BRIGHT seguidos solo cuestan lo necesario.
  let ink = null, paper = null, bright = 0, sentInk, sentPaper;
  const send = (want) => {
    const [wi, wp] = want;
    if (wi !== null && wi !== sentInk) { out.push(wi << 3); sentInk = wi; }
    if (wp !== null && wp !== sentPaper) { out.push((wp << 3) | 1); sentPaper = wp; }
  };
  const state = () => [ink === null ? null : zxColour(ink, bright), paper === null ? null : zxColour(paper, bright)];
  // antes de pintar: los colores de la orden (o los que ha calculado el Painter)
  const draw = (i) => send(colours?.get(i) ?? state());
  const mode = (c) => ((c & 8) ? 0x80 : 0) | ((c & 16) ? 0x40 : 0);   // OVER, INVERSE
  // signos: en el Spectrum el bit 6 es x negativa y el 7 y negativa (hacia abajo)
  const signs = (c, dx, dy) => ((c & 0x40) && dx ? 0x20 : 0) | (!(c & 0x80) && dy ? 0x10 : 0);
  for (let i = 0; i < d.length;) {
    const c = d[i], op = c & 7;
    if (op === 7) break;
    if (op === 0) {                                     // PLOT x y
      draw(i);
      const x = d[i + 1] + x0, y = Math.max(0, 175 - d[i + 2]);
      out.push(4 | mode(c) | ((x >> 8) << 3), x & 255, y);
      i += 3;
    } else if (op === 1) {                              // LINE dx dy (forma larga o corta)
      let dx, dy, len = 3;
      if (c & 0x20) { dx = d[i + 1] >> 4; dy = d[i + 1] & 15; len = 2; } else { dx = d[i + 1]; dy = d[i + 2]; }
      if ((c & 0x18) !== 0x18) draw(i);
      out.push(5 | mode(c) | signs(c, dx, dy), dx, dy);
      i += len;
    } else if (op === 2) {
      if (c === 0x12) {                                 // BLOCK alto ancho col fila
        draw(i);
        const h = d[i + 1], w = d[i + 2], col = d[i + 3] + col0, row = d[i + 4];
        out.push(0x87, Math.min(24, row), Math.min(39, col), Math.min(h, 24 - row), Math.min(w, 39 - col));
        i += 5;
      } else if (skip && skip.has(i)) {                // relleno que en el Spectrum no hace nada
        i += c & 0x20 ? 4 : 3;
      } else if (c & 0x20) {                            // SHADE dx dy c
        draw(i);
        out.push(0x86 | (c & 0x10 ? 0x40 : 0) | signs(c, d[i + 1], d[i + 2]), d[i + 1], d[i + 2], charMap(d[i + 3]));
        i += 4;
      } else {                                          // FILL dx dy
        draw(i);
        out.push(6 | signs(c, d[i + 1], d[i + 2]), d[i + 1], d[i + 2]);
        i += 3;
      }
    } else if (op === 3) {                              // GOSUB: los bits de espejo, cambiados
      send(state());
      out.push(3 | (c & 0x38) | (c & 0x40 ? 0x80 : 0) | (c & 0x80 ? 0x40 : 0), d[i + 1]);
      sentInk = sentPaper = undefined;                  // el subdibujo puede cambiarlos
      i += 2;
    } else if (op === 4) {                              // TEXT c col fila
      draw(i);
      out.push(7 | (c & 8 ? 0x40 : 0) | (c & 16 ? 0x20 : 0), Math.min(24, d[i + 3]), Math.min(39, d[i + 2] + col0), d[i + 1]);
      i += 4;
    } else if (op === 5) {                              // PAPER v / BRIGHT v
      const v = (c >> 3) & 15;
      if (c & 0x80) { if (v < 2) bright = v; } else paper = v;
      i += 1;
    } else {                                            // INK v / FLASH (no hay)
      if (!(c & 0x80)) ink = (c >> 3) & 15;
      i += 1;
    }
  }
  send(state());                                       // un subdibujo deja sus colores puestos
  out.push(2);
  return out;
}

// Se pinta el dibujo de localidad en el Spectrum, orden a orden, para dos cosas:
// - skip: rellenos (FILL y SHADE) que no cambian nada, porque su punto de
//   inicio cae en un punto ya pintado y el relleno se para ahí. Las líneas del
//   C64 no pintan exactamente los mismos puntos, y ese punto podría estar libre
//   y rellenar media pantalla, así que se quitan.
// - colours: en el Spectrum BRIGHT va aparte, y con la tinta o el papel
//   transparentes aclara u oscurece el color que ya tenía el cuadro. El C64 no
//   puede decir "el mismo papel, más claro", así que si todos los cuadros que
//   cambia la orden acaban igual, se le ponen esos colores tal cual.
function analyse(pics, n, pic, zxCharset) {
  const d = pics[n], skip = new Set(), colours = new Map();
  const mem = new Uint8Array(6912);
  const attr = ((pic.paper ?? 0) & 7) << 3 | ((pic.ink ?? 7) & 7);
  mem.fill(attr, 6144);
  const lib = pics.map((x) => (x ? { data: x } : null));
  const p = new Painter(mem, lib, { kind: 'daad', charset: zxCharset });
  p.setColours(attr);
  const slot = lib.length;
  for (let i = 0; i < d.length;) {
    const c = d[i], op = c & 7;
    if (op === 7) break;
    const len = op === 0 ? 3 : op === 1 ? (c & 0x20 ? 2 : 3) : op === 2 ? (c === 0x12 ? 5 : c & 0x20 ? 4 : 3) : op === 3 ? 2 : op === 4 ? 4 : 1;
    const fill = op === 2 && c !== 0x12;
    const drawing = op === 0 || op === 1 || op === 2 || op === 4;
    const mixed = (p.mask & 0x40) === 0 && (p.mask & 0x3f) !== 0;   // BRIGHT puesto con algo transparente
    const before = fill || (drawing && mixed) ? mem.slice() : null;
    lib[slot] = { data: [...d.slice(i, i + len), 7] };
    try { p.run(slot); } catch { break; }
    if (fill && before.every((v, k) => v === mem[k])) skip.add(i);
    else if (drawing && mixed) {
      const ends = new Set();
      for (let k = 6144; k < 6912; k++) if (mem[k] !== before[k]) ends.add(mem[k] & 0x7f);
      if (ends.size === 1) {
        const a = [...ends][0], b = a & 0x40 ? 1 : 0;
        colours.set(i, [zxColour(a & 7, b), zxColour((a >> 3) & 7, b)]);
      }
    }
    i += len;
  }
  return { skip, colours };
}

// Ventana de un dibujo: las columnas de DAAD en el Spectrum son de 6 puntos;
// en el C64 la ventana cubre los mismos puntos que el dibujo (4 columnas más
// a la derecha, porque va centrado)
function c64Window(p) {
  const c0 = Math.floor((p.col ?? 0) * 6 / 8), c1 = Math.min(32, Math.ceil(((p.col ?? 0) + (p.width ?? 42)) * 6 / 8));
  return [Math.min(24, p.line ?? 0), COL0 + c0, Math.max(1, Math.min(25, p.height ?? 12)), Math.max(1, c1 - c0)];
}

// Paredes: en el Spectrum los rellenos se paran en los bordes de la pantalla
// (x = 0 y 255); en el C64 seguirían por los lados. Dos líneas verticales en
// negro sobre negro, justo fuera del dibujo y a lo alto de su ventana, los
// paran en el mismo sitio sin que se vean. Luego vuelven los colores de la
// ventana.
function walls(win, colour) {
  const [line, , height] = win;
  // (LINE no pinta su último punto: con len puntos llega justo al final de la ventana)
  const top = 8 * line, len = Math.min(8 * height, 200 - top);
  if (len < 1) return [];
  const out = [0 << 3, (0 << 3) | 1];
  for (const x of [X0 - 1, X0 + 256]) out.push(4 | ((x >> 8) << 3), x & 255, top, 5, 0, len);
  out.push((colour >> 4) << 3, ((colour & 15) << 3) | 1);
  return out;
}

// La base completa. pictures: dibujos del modelo por número ({ drawstring,
// location, paper, ink, ... } o null); charset: 2048 bytes (el del C64 o el
// del proyecto); zxCharset: el que usan los dibujos en el Spectrum, para que
// las tramas salgan iguales. Devuelve { bytes, load, converted, skipped }.
export function buildC64Gfx(pictures, charset, zxCharset = charset) {
  const cs = Uint8Array.from(charset);
  // caracteres que piden los dibujos: los de TEXT se quedan como están; las
  // tramas, si el carácter del C64 no es igual que el del Spectrum, van a un
  // hueco libre (del 255 hacia abajo)
  const textChars = new Set(), shadeChars = new Set();
  for (const p of pictures) {
    const d = p?.drawstring;
    if (!d) continue;
    for (let i = 0; i < d.length;) {
      const c = d[i], op = c & 7;
      if (op === 7) break;
      if (op === 4) textChars.add(d[i + 1]);
      if (op === 2 && c !== 0x12 && (c & 0x20)) shadeChars.add(d[i + 3]);
      i += op === 0 ? 3 : op === 1 ? (c & 0x20 ? 2 : 3) : op === 2 ? (c === 0x12 ? 5 : c & 0x20 ? 4 : 3) : op === 3 ? 2 : op === 4 ? 4 : 1;
    }
  }
  const map = new Map();
  let free = 255;
  for (const ch of shadeChars) {
    const pat = zxCharset.subarray(ch * 8, ch * 8 + 8);
    if (pat.every((v, k) => cs[ch * 8 + k] === v)) { map.set(ch, ch); continue; }
    while (free >= 128 && (textChars.has(free) || shadeChars.has(free))) free--;
    if (free < 128) { map.set(ch, ch); continue; }
    cs.set(pat, free * 8);
    map.set(ch, free--);
  }
  const charMap = (c) => map.get(c) ?? c;

  const pics = pictures.map((p) => (p && p.drawstring ? Uint8Array.from(p.drawstring) : null));
  const entries = [];
  let converted = 0, skipped = 0;
  const sub = { data: [2], win: [0x80, 0x10, 0, 0, 12, 40] };
  pictures.forEach((p, n) => {
    if (!p) { entries.push(sub); return; }
    const w = c64Window(p);
    const colour = (zxColour(p.ink ?? 7, 0) << 4) | zxColour(p.paper ?? 0, 0);
    if (!p.drawstring) {
      if (p.location !== false) skipped++;
      entries.push({ data: [2], win: [p.location === false ? 0x80 : 0, colour, ...w] });
      return;
    }
    if (p.location === false) { entries.push({ data: convertDrawstring(p.drawstring, charMap), win: [0x80, colour, ...w] }); return; }
    converted++;
    const { skip, colours } = analyse(pics, n, p, zxCharset);
    entries.push({ data: [...walls(w, colour), ...convertDrawstring(p.drawstring, charMap, { skip, colours })], win: [0, colour, ...w] });
  });
  if (!entries.length) entries.push(sub);

  const dataLen = entries.reduce((a, e) => a + e.data.length, 0);
  const ptrLen = 2 * (entries.length + 2), winLen = 6 * entries.length + 1;
  const start = CHARSET_AT - winLen - ptrLen - dataLen;
  const b = new Uint8Array(C64_END - start);
  const at = (a) => a - start;
  const w16 = (a, v) => { b[at(a)] = v & 255; b[at(a) + 1] = v >> 8; };
  let a = start;
  const ptrs = entries.map((e) => { const p = a; b.set(e.data, at(a)); a += e.data.length; return p; });
  const ptrTable = a;
  for (const p of ptrs) { w16(a, p); a += 2; }
  w16(a, ptrTable); a += 2;
  w16(a, 0xffff); a += 2;
  const winTable = a;
  for (const e of entries) { b.set(e.win, at(a)); a += 6; }
  const winEnd = a;
  b[at(a)] = 0xff; a++;
  if (a !== CHARSET_AT) throw new Error('base de gráficos de C64 mal calculada');
  b.set(cs, at(CHARSET_AT));
  b[at(COLOURS_AT)] = 0;
  b.set(TEXT_COLOURS, at(COLOURS_AT + 1));
  b[at(0xcbed)] = 0; b[at(0xcbee)] = 0x52;
  [start, ptrTable, winTable, winEnd, CHARSET_AT, COLOURS_AT, 0xffff].forEach((v, i) => w16(PTRS_AT + 2 * i, v));
  b[at(0xcbfd)] = entries.length;
  return { bytes: b, load: start, converted, skipped };
}
