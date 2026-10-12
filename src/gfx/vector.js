// Dibujos vectoriales de DAAD: leer, escribir y comprobar sus órdenes.
//
// Formato (el de las cadenas del SDG de DAAD, heredado de PAW):
//   PLOT x y          000 i o 000 (3 bytes)     o = OVER, i = INVERSE; los dos = mover
//   LINE dx dy        y x s i o 001 (3 bytes)   x, y = signo; s = forma corta (2 bytes,
//                                               dx y dy de 0 a 15 en un solo byte)
//   FILL dx dy        y x 0 0 0 010 (3 bytes)
//   SHADE dx dy c     y x 1 i 0 010 (4 bytes)   c = carácter con la trama
//   BLOCK h w col fila  00010010 (5 bytes)      bloque de atributos
//   GOSUB n           m m e e e 011 (2 bytes)   e = escala (0 = 1:1), m = espejo
//   TEXT c col fila   000 i o 100 (4 bytes)
//   PAPER / BRIGHT    b v v v v 101             b = 1 para BRIGHT; v = 0-7, 8 = transparente
//   INK / FLASH       f v v v v 110
//   END               00000111
// Las coordenadas van de abajo arriba (y = 0 abajo, 175 arriba).

import { Painter, OffScreen } from './drawstring.js';
import { t } from '../i18n.js';

export function opLen(d, i) {
  const c = d[i], op = c & 7;
  if (op === 0) return 3;
  if (op === 1) return c & 0x20 ? 2 : 3;
  if (op === 2) return c === 0x12 ? 5 : c & 0x20 ? 4 : 3;
  if (op === 3) return 2;
  if (op === 4) return 4;
  return 1;
}

// Lista de órdenes: { at, len, kind, ... } (sin el END final)
export function decode(d) {
  const out = [];
  for (let i = 0; i < d.length;) {
    const c = d[i], op = c & 7, len = opLen(d, i);
    const mode = (c >> 3) & 3;                 // 1 = OVER, 2 = INVERSE, 3 = los dos
    const sx = c & 0x40 ? -1 : 1, sy = c & 0x80 ? -1 : 1;
    const o = { at: i, len, code: c };
    if (op === 7) break;
    if (op === 0) Object.assign(o, mode === 3 ? { kind: 'move', x: d[i + 1], y: d[i + 2] } : { kind: 'plot', x: d[i + 1], y: d[i + 2], mode });
    else if (op === 1) {
      const [dx, dy] = c & 0x20 ? [d[i + 1] >> 4, d[i + 1] & 15] : [d[i + 1], d[i + 2]];
      Object.assign(o, { kind: mode === 3 ? 'rmove' : 'line', dx: dx * sx, dy: dy * sy, mode });
    } else if (op === 2) {
      if (c === 0x12) Object.assign(o, { kind: 'block', h: d[i + 1], w: d[i + 2], col: d[i + 3], row: d[i + 4] });
      else if (c & 0x20) Object.assign(o, { kind: 'shade', dx: d[i + 1] * sx, dy: d[i + 2] * sy, ch: d[i + 3], inverse: !!(c & 0x10) });
      else Object.assign(o, { kind: 'fill', dx: d[i + 1] * sx, dy: d[i + 2] * sy });
    } else if (op === 3) Object.assign(o, { kind: 'gosub', n: d[i + 1], scale: (c >> 3) & 7, mirror: c >> 6 });
    else if (op === 4) Object.assign(o, { kind: 'text', ch: d[i + 1], col: d[i + 2], row: d[i + 3], mode });
    else if (op === 5) Object.assign(o, { kind: c & 0x80 ? 'bright' : 'paper', v: (c >> 3) & 15 });
    else if (op === 6) Object.assign(o, { kind: c & 0x80 ? 'flash' : 'ink', v: (c >> 3) & 15 });
    out.push(o);
    i += len;
  }
  return out;
}

const signs = (dx, dy) => (dx < 0 ? 0x40 : 0) | (dy < 0 ? 0x80 : 0);
const clamp = (v) => Math.max(0, Math.min(255, Math.abs(v)));
// mode: 0 normal, 1 OVER (invierte), 2 INVERSE (borra)
export const enc = {
  plot: (x, y, mode = 0) => [mode << 3, x & 255, Math.max(0, Math.min(175, y))],
  move: (x, y) => [0x18, x & 255, Math.max(0, Math.min(175, y))],
  line(dx, dy, mode = 0) {
    const c = 1 | (mode << 3) | signs(dx, dy);
    const ax = clamp(dx), ay = clamp(dy);
    return ax < 16 && ay < 16 ? [c | 0x20, (ax << 4) | ay] : [c, ax, ay];
  },
  rmove: (dx, dy) => enc.line(dx, dy, 3),
  fill: (dx, dy) => [2 | signs(dx, dy), clamp(dx), clamp(dy)],
  shade: (dx, dy, ch, inverse = false) => [2 | 0x20 | (inverse ? 0x10 : 0) | signs(dx, dy), clamp(dx), clamp(dy), ch & 255],
  block: (h, w, col, row) => [0x12, h, w, col, row],
  gosub: (n, scale = 0, mirror = 0) => [3 | ((scale & 7) << 3) | ((mirror & 3) << 6), n & 255],
  text: (ch, col, row, mode = 0) => [4 | (mode << 3), ch & 255, col, row],
  paper: (v) => [5 | ((v & 15) << 3)],
  bright: (v) => [5 | 0x80 | ((v & 15) << 3)],
  ink: (v) => [6 | ((v & 15) << 3)],
  flash: (v) => [6 | 0x80 | ((v & 15) << 3)],
};

const sg = (v) => (v < 0 ? '−' + -v : '+' + v);
const MODE = () => ['', t(' (invirtiendo)'), t(' (borrando)'), ''];
const COLOUR = (v) => (v === 8 ? t('transparente') : String(v));
export function describe(o, nameOf = (n) => String(n)) {
  switch (o.kind) {
    case 'plot': return t('Punto en {x},{y}', { x: o.x, y: o.y }) + MODE()[o.mode];
    case 'move': return t('Ir a {x},{y}', { x: o.x, y: o.y });
    case 'line': return t('Línea {dx} {dy}', { dx: sg(o.dx), dy: sg(o.dy) }) + MODE()[o.mode];
    case 'rmove': return t('Mover {dx} {dy}', { dx: sg(o.dx), dy: sg(o.dy) });
    case 'fill': return t('Rellenar en {dx} {dy}', { dx: sg(o.dx), dy: sg(o.dy) });
    case 'shade': return t('Trama {c} en {dx} {dy}', { c: o.ch, dx: sg(o.dx), dy: sg(o.dy) }) + (o.inverse ? t(' (en negativo)') : '');
    case 'block': return t('Color de {w}x{h} cuadros en {col},{row}', { w: o.w + 1, h: o.h + 1, col: o.col, row: o.row });
    case 'gosub': return t('Dibujo {n}', { n: nameOf(o.n) }) + (o.scale ? t(' a escala {s}/8', { s: o.scale }) : '') + (o.mirror ? t(' (espejo)') : '');
    case 'text': return t('Letra {c} en {col},{row}', { c: o.ch >= 32 && o.ch < 127 ? `«${String.fromCharCode(o.ch)}»` : o.ch, col: o.col, row: o.row }) + MODE()[o.mode];
    case 'paper': return t('Papel {v}', { v: COLOUR(o.v) });
    case 'ink': return t('Tinta {v}', { v: COLOUR(o.v) });
    case 'bright': return t('Brillo {v}', { v: COLOUR(o.v) });
    case 'flash': return t('Parpadeo {v}', { v: COLOUR(o.v) });
  }
  return '?';
}

// Pinta el dibujo n sobre una pantalla (6912 bytes) como lo hace DISPLAY:
// la ventana del dibujo se borra con su papel y su tinta. lib: dibujos por
// número ({ data }); upto: pintar solo hasta esa posición del dibujo n.
export function paint(lib, n, pic, { charset, upto, mem } = {}) {
  mem ??= new Uint8Array(6912);
  const attr = ((pic.paper ?? 0) & 7) << 3 | ((pic.ink ?? 7) & 7);
  const top = pic.line ?? 0, rows = pic.height ?? 12;
  for (let r = top; r < Math.min(24, top + rows); r++) {
    for (let y = r * 8; y < r * 8 + 8; y++) mem.fill(0, rowAddr(y), rowAddr(y) + 32);
    mem.fill(attr, 6144 + r * 32, 6144 + r * 32 + 32);
  }
  const l = lib.slice();
  const d = lib[n]?.data ?? [7];
  l[n] = { data: upto == null ? d : [...d.slice(0, upto), 7] };
  const p = new Painter(mem, l, { kind: 'daad', charset });
  p.setColours(attr);
  p.run(n);
  return { mem, x: p.x, y: p.y };
}

// Dónde queda la pluma tras las órdenes del dibujo n hasta la posición upto
export function penAt(lib, n, upto, charset) {
  const { x, y } = paint(lib, n, { line: 0, height: 0 }, { charset, upto });
  return { x, y };
}

// ¿Se sale de la pantalla? Devuelve null o { at, path }: la orden del dibujo n
// donde la ROM daría el error B (y, si es dentro de un GOSUB, el camino).
export function offScreen(lib, n, charset) {
  const p = new Painter(new Uint8Array(6912), lib, { kind: 'daad', charset });
  p.strict = true;
  try { p.run(n); } catch (e) {
    if (e instanceof OffScreen) return { at: e.path[0], path: e.path };
    throw e;
  }
  return null;
}

const rowAddr = (y) => ((y & 0xc0) << 5) | ((y & 7) << 8) | ((y & 0x38) << 2);
