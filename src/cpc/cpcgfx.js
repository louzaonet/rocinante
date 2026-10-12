// Base de gráficos de DAAD para Amstrad CPC a partir de los dibujos
// vectoriales del Spectrum.
//
// El intérprete de CPC tiene sus propias órdenes (las que escribe su editor
// DG). Byte de orden: los bits 1-3 dicen cuál es:
//   000  PEN p        1 byte; bit 4 = PAPER (fondo de las letras), el pen va
//                     en los bits 7 (bit 0 del pen) y 0 (bit 1); bit 6 = END
//   001  TEXT x y c   4 bytes; x de 9 bits (el 9º en el bit 7)
//   010  GOSUB n      2 bytes; espejo en los bits 5 (x) y 4 (y), escala en 0,7,6
//   011  PLOT x y     3 bytes; bit 6 = pintar (si no, solo mover); x de 9 bits
//   100  LINE dx dy   relativa; bit 6 = pintar (si no, mover); bits 5 y 4 =
//                     signo de dx y dy; bit 7 = 9º bit de dx; bit 0 = forma
//                     corta (2 bytes, dx y dy de 0 a 15 en un solo byte)
//   101  FILL dx dy   3 bytes, relativa al punto actual (que no se mueve)
//   110  SHADE dx dy c  4 bytes; trama = el carácter c; los bits 6 y 0 son el
//                     pen del fondo de la trama
//   111  BLOCK a h w  5 bytes; caja rellena con el pen actual (SCR FLOOD BOX):
//                     dirección de pantalla, alto en líneas, ancho en bytes
// Coordenadas en puntos de modo 1: x de 0 a 319, y de 0 (abajo) a 183 (arriba;
// las dos últimas filas de la pantalla quedan para la entrada de órdenes).
//
// Estructura de la base (se carga para que acabe en A600h; el juego de
// caracteres está siempre en 9E00h y el bloque de punteros en 9DEFh):
//   órdenes de los dibujos
//   tabla de punteros: uno por dibujo, el de esa tabla y FFFFh
//   ventanas: 8 bytes por dibujo y FFh
//     tinta 0 (y borde; bit 7 = subdibujo), tintas 1-3 (bit 6 = no cambiar),
//     línea, columna, alto, ancho
//   9DE0h: 8 x FFh   9DE8h: borde y tintas al empezar   9DEEh: 40h
//   9DEFh: punteros a datos, punteros, ventanas, fin de ventanas, 9DE0h, 9DE8h,
//          FFFFh, nº de dibujos, 0, 0
//   9E00h: juego de caracteres (2048 bytes)
//
// Conversión: el modo 1 del CPC tiene 4 tintas para toda la pantalla y el
// Spectrum tiene atributos por cuadro de 8x8. Se pinta el dibujo del Spectrum
// con el Painter, que es exacto, y se usa el resultado como guía: cada orden
// se pinta en el CPC con la tinta que acaban teniendo sus puntos, y los fondos
// de color salen de cajas (BLOCK) al principio. Las tintas 0 y 1 son las del
// texto (negro y blanco) y la 2 y la 3 se eligen para cada dibujo. Los GOSUB se
// desenrollan, porque cada llamada puede necesitar otras tintas y la escala del
// CPC redondea distinto. El dibujo queda centrado: x + 32, y + 8.

import { Painter } from '../gfx/drawstring.js';

export const CPC_END = 0xa600;
const CHARSET_AT = 0x9e00, PTRS_AT = 0x9def;
const X0 = 32, Y0 = 8;                        // desplazamiento del Spectrum al CPC
export const TEXT_INKS = [0, 26];             // tintas 0 y 1: fondo y letra del texto

// Colores del firmware (0-26): n = 9*verde + 3*rojo + azul, niveles 0..2
export const cpcRGB = (n) => { const g = Math.floor(n / 9), r = Math.floor(n / 3) % 3, b = n % 3; return [r, g, b].map((v) => [0, 128, 255][v]); };
// Colores del Spectrum en el CPC. Los normales del Spectrum (D7h) están más
// cerca del nivel alto del CPC (FFh) que del medio (80h), así que normal y
// BRIGHT van al mismo color.
const ZX2CPC_ = [0, 2, 6, 8, 18, 20, 24, 26];
const ZX2CPC = [ZX2CPC_, ZX2CPC_];

const rowAddr = (y) => ((y & 0xc0) << 5) | ((y & 7) << 8) | ((y & 0x38) << 2);

// Desenrolla los GOSUB de un dibujo: lista de órdenes sueltas del Spectrum con
// la escala y el espejo ya aplicados (las relativas, en forma larga).
export function flatten(pics, n, scale = 0, flip = 0, depth = 0, out = []) {
  const d = pics[n];
  if (!d || depth > 10) return out;
  const sc = (v) => (scale ? (v * scale) >> 3 : v);
  for (let i = 0; i < d.length;) {
    const c = d[i], op = c & 7, fl = c ^ flip;
    const sign = (fl & 0x40 ? 0x40 : 0) | (fl & 0x80 ? 0x80 : 0);
    if (op === 7) break;
    if (op === 0) { out.push([c, d[i + 1], d[i + 2]]); i += 3; }
    else if (op === 1) {
      let dx, dy, len = 3;
      if (c & 0x20) { dx = d[i + 1] >> 4; dy = d[i + 1] & 15; len = 2; } else { dx = d[i + 1]; dy = d[i + 2]; }
      out.push([(c & 0x18) | 1 | sign, sc(dx), sc(dy)]);
      i += len;
    } else if (op === 2) {
      if (c === 0x12) { out.push(Array.from(d.subarray ? d.subarray(i, i + 5) : d.slice(i, i + 5))); i += 5; }
      else if (c & 0x20) { out.push([(c & 0x30) | 2 | sign, sc(d[i + 1]), sc(d[i + 2]), d[i + 3]]); i += 4; }
      else { out.push([2 | sign, sc(d[i + 1]), sc(d[i + 2])]); i += 3; }
    } else if (op === 3) {
      flatten(pics, d[i + 1], (c >> 3) & 7, (c & 0xc0) ^ flip, depth + 1, out);
      i += 2;
    } else if (op === 4) { out.push([c, d[i + 1], d[i + 2], d[i + 3]]); i += 4; }
    else { out.push([c]); i += 1; }
  }
  return out;
}

// Painter que apunta los puntos que toca cada orden
class Recorder extends Painter {
  plot(x, y) { if (this.touched && x >= 0 && x <= 255 && y >= 0 && y <= 175) this.touched.push(x | (y << 8)); super.plot(x, y); }
}

// Colores del Spectrum ya pintado: color de cada punto (0-26 del CPC)
function finalColours(mem) {
  const col = new Uint8Array(256 * 176);
  for (let y = 0; y < 176; y++) {
    const sy = 175 - y, a = rowAddr(sy);
    for (let x = 0; x < 256; x++) {
      const at = mem[6144 + (sy >> 3) * 32 + (x >> 3)];
      const set = mem[a + (x >> 3)] & (0x80 >> (x & 7));
      col[x | (y << 8)] = ZX2CPC[at & 0x40 ? 1 : 0][set ? at & 7 : (at >> 3) & 7];
    }
  }
  return col;
}
const pixelSet = (mem, p) => mem[rowAddr(175 - (p >> 8)) + ((p & 255) >> 3)] & (0x80 >> (p & 7));

// Tinta más cercana de las cuatro
function nearest(inks, c) {
  const [r, g, b] = cpcRGB(c);
  let best = 0, bd = Infinity;
  inks.forEach((k, i) => {
    const [r2, g2, b2] = cpcRGB(k);
    const dd = 3 * (r - r2) ** 2 + 4 * (g - g2) ** 2 + 2 * (b - b2) ** 2;
    if (dd < bd) { bd = dd; best = i; }
  });
  return best;
}
const majority = (list) => {
  const n = [0, 0, 0, 0];
  for (const v of list) n[v]++;
  return n.indexOf(Math.max(...n));
};

// Convierte un dibujo de localidad. pics: cadenas del Spectrum por número;
// pic: { paper, ink }. Devuelve { data, inks } (data acaba en END).
export function convertPicture(pics, n, pic, charset, shadeChar) {
  const flat = flatten(pics, n);
  const attr0 = ((pic.paper ?? 0) & 7) << 3 | ((pic.ink ?? 7) & 7);
  // la ventana del dibujo en cuadros de 8x8 (las columnas de DAAD son de 6 puntos)
  const r0 = pic.line ?? 0, r1 = Math.min(22, r0 + (pic.height ?? 12));
  const c0 = Math.floor((pic.col ?? 0) * 6 / 8), c1 = Math.min(32, Math.ceil(((pic.col ?? 0) + (pic.width ?? 42)) * 6 / 8));
  const inWin = (r, c) => r >= r0 && r < r1 && c >= c0 && c < c1;
  const fresh = () => {
    const mem = new Uint8Array(6912);
    // fuera de la ventana, los colores del texto: letra blanca sobre negro
    for (let r = 0; r < 24; r++) for (let c = 0; c < 32; c++) mem[6144 + r * 32 + c] = inWin(r, c) ? attr0 : 0x07;
    const p = new Recorder(mem, [], { kind: 'daad', charset });
    p.setColours(attr0);
    return p;
  };
  const step = (p, cmd) => { p.pics[0] = { data: [...cmd, 7] }; p.run(0); };

  // 1. El dibujo terminado y sus colores
  const done = fresh();
  for (const cmd of flat) step(done, cmd);
  const fin = finalColours(done.mem);

  // 2. Tintas 2 y 3: los dos colores que más se ven, aparte de los del texto
  const count = new Map();
  for (const c of fin) if (!TEXT_INKS.includes(c)) count.set(c, (count.get(c) || 0) + 1);
  const top = [...count].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  const inks = [...TEXT_INKS, top[0] ?? 2, top[1] ?? top[0] ?? 6];
  const penOf = new Uint8Array(256 * 176);
  for (let i = 0; i < fin.length; i++) penOf[i] = nearest(inks, fin[i]);

  // Lo que se va pintando en el CPC (tinta de cada punto), para saber hasta
  // dónde llegaría cada relleno
  const sim = new Uint8Array(256 * 176);
  const out = [];
  // posición actual en coordenadas del Spectrum: el CPC empieza en su 0,0
  let pen = -1, paper = 0, cx = -X0, cy = -Y0;
  const setPen = (p) => { if (p !== pen) { out.push(((p & 1) << 7) | (p >> 1)); pen = p; } };
  const setPaper = (p) => { if (p !== paper) { out.push(0x10 | ((p & 1) << 7) | (p >> 1)); paper = p; } };
  const xy = (x, y) => [x + X0, y + Y0];

  // 3. Fondos: cajas con el color de papel de cada cuadro (el resto es tinta 0)
  const cellPen = (r, c) => {
    const at = done.mem[6144 + r * 32 + c];
    return nearest(inks, ZX2CPC[at & 0x40 ? 1 : 0][(at >> 3) & 7]);
  };
  const boxes = [];
  const used = new Uint8Array(22 * 32);
  for (let r = 0; r < 22; r++) {
    for (let c = 0; c < 32; c++) {
      const pn = cellPen(r, c);
      if (!pn || used[r * 32 + c] || !inWin(r, c)) continue;
      let w = 1;
      while (c + w < 32 && inWin(r, c + w) && !used[r * 32 + c + w] && cellPen(r, c + w) === pn) w++;
      let h = 1;
      while (r + h < 22) {
        let ok = true;
        for (let k = 0; k < w; k++) if (!inWin(r + h, c + k) || used[(r + h) * 32 + c + k] || cellPen(r + h, c + k) !== pn) { ok = false; break; }
        if (!ok) break;
        h++;
      }
      for (let i = 0; i < h; i++) for (let k = 0; k < w; k++) used[(r + i) * 32 + c + k] = 1;
      boxes.push({ r, c, w, h, pn });
    }
  }
  boxes.sort((a, b) => a.pn - b.pn);
  for (const b of boxes) {
    setPen(b.pn);
    const line = 8 * b.r, addr = 0xc000 + (line & 7) * 0x800 + (line >> 3) * 80 + 2 * b.c + X0 / 4;
    out.push(0x0e, addr & 255, addr >> 8, 8 * b.h, 2 * b.w);
    for (let y = 175 - 8 * (b.r + b.h - 1) - 7; y <= 175 - 8 * b.r; y++) for (let x = 8 * b.c; x < 8 * (b.c + b.w); x++) sim[x | (y << 8)] = b.pn;
  }

  // Mueve el punto actual del CPC a (x, y) si hace falta
  const moveTo = (x, y) => {
    if (x === cx && y === cy) return;
    const [X, Y] = xy(x, y);
    if (X >= 0 && X < 512 && Y >= 0 && Y < 256) out.push(0x06 | ((X >> 8) << 7), X & 255, Y);
    cx = x; cy = y;
  };
  const relCode = (base, dx, dy) => base | (dx < 0 ? 0x20 : 0) | (dy < 0 ? 0x10 : 0) | ((Math.abs(dx) >> 8) << 7);
  const lineTo = (x, y) => {
    let dx = x - cx, dy = y - cy;
    while (dx || dy) {                       // trozos de 255 como mucho en y
      const sx = Math.max(-511, Math.min(511, dx)), sy = Math.max(-255, Math.min(255, dy));
      if (Math.abs(sx) < 16 && Math.abs(sy) < 16) out.push(relCode(0x49, sx, sy), (Math.abs(sx) << 4) | Math.abs(sy));
      else out.push(relCode(0x48, sx, sy), Math.abs(sx) & 255, Math.abs(sy));
      dx -= sx; dy -= sy;
    }
    cx = x; cy = y;
  };
  // Relleno simulado del CPC: la zona de la misma tinta que el punto de inicio
  // (edge: llega al borde del dibujo con la tinta 0, que en el CPC sigue fuera)
  const region = (seed) => {
    const want = sim[seed], seen = new Uint8Array(256 * 176), list = [seed];
    let edge = false;
    seen[seed] = 1;
    for (let k = 0; k < list.length; k++) {
      const p = list[k], x = p & 255, y = p >> 8;
      if (want === 0 && (x === 0 || x === 255 || y === 0)) edge = true;
      for (const q of [x > 0 ? p - 1 : -1, x < 255 ? p + 1 : -1, y > 0 ? p - 256 : -1, y < 175 ? p + 256 : -1]) {
        if (q >= 0 && !seen[q] && sim[q] === want) { seen[q] = 1; list.push(q); }
      }
    }
    return { list, edge };
  };

  // 4. Las órdenes, una a una
  const work = fresh();
  for (const cmd of flat) {
    const c = cmd[0], op = c & 7;
    if (op >= 5 || c === 0x12) { step(work, cmd); continue; }       // colores y BLOCK: ya están en las tintas
    const before = work.mem.slice(0, 6144);
    const x0 = work.x, y0 = work.y;
    work.touched = [];
    step(work, cmd);
    const touched = work.touched;
    work.touched = null;
    if (op === 0 || op === 1) {
      if (!touched.length) { if (op === 0) moveTo(work.x, work.y); else moveRel(work.x, work.y); continue; }
      setPen(majority(touched.map((p) => penOf[p])));
      if (op === 0) {
        const [X, Y] = xy(cmd[1], cmd[2]);
        out.push(0x46 | ((X >> 8) << 7), X & 255, Y);
        cx = cmd[1]; cy = cmd[2];
      } else {
        if (cx !== x0 || cy !== y0) moveTo(x0, y0);
        lineTo(work.x, work.y);
      }
      for (const p of touched) sim[p] = pen;
      continue;
    }
    if (op === 4) {                                                   // TEXT
      const ch = cmd[1], col = cmd[2], row = cmd[3];
      if (row > 21 || col > 31) continue;
      const on = [], off = [];
      for (let r = 0; r < 8; r++) for (let k = 0; k < 8; k++) {
        const p = (8 * col + k) | ((175 - 8 * row - r) << 8);
        (pixelSet(work.mem, p) ? on : off).push(p);
      }
      if (on.length) setPen(majority(on.map((p) => penOf[p])));
      setPaper(off.length ? majority(off.map((p) => penOf[p])) : 0);
      const [X, Y] = xy(8 * col, 175 - 8 * row);
      out.push(0x02 | ((X >> 8) << 7), X & 255, Y, ch);
      for (const p of on) sim[p] = pen;
      for (const p of off) sim[p] = paper;
      continue;
    }
    // FILL y SHADE: los puntos que se han encendido
    const lit = [];
    for (let a = 0; a < 6144; a++) {
      const diff = work.mem[a] & ~before[a];
      if (!diff) continue;
      const y = 175 - (((a >> 8) & 7) | ((a >> 2) & 0x38) | ((a >> 5) & 0xc0));
      for (let k = 0; k < 8; k++) if (diff & (0x80 >> k)) lit.push((((a & 31) << 3) + k) | (y << 8));
    }
    if (!lit.length) continue;
    const inLit = new Uint8Array(256 * 176);
    for (const p of lit) inLit[p] = 1;
    // punto de inicio, como lo calcula el intérprete del Spectrum (x da la vuelta en 256, y en 176)
    const seedS = ((work.x + cmd[1] * (c & 0x40 ? -1 : 1)) & 255) | ((((work.y + cmd[2] * (c & 0x80 ? -1 : 1)) % 176 + 176) % 176) << 8);
    if (c & 0x20) {
      // SHADE: una sola orden desde el mismo punto; el fondo de la trama es lo que haya
      const seed = inLit[seedS] || !pixelSet(before, seedS) ? seedS : lit[0];
      const target = majority(lit.map((p) => penOf[p])), bg = sim[seed];
      setPen(target);
      const ch = shadeChar(cmd[3], !!(c & 0x10));
      const dx = (seed & 255) - cx, dy = (seed >> 8) - cy;
      out.push(relCode(0x0c, dx, dy) | ((bg & 1) << 6) | (bg >> 1), Math.abs(dx) & 255, Math.abs(dy), ch);
      for (const p of region(seed).list) sim[p] = inLit[p] ? target : bg;
      continue;
    }
    // FILL: por zonas que en el CPC tienen la misma tinta
    const seen = new Uint8Array(256 * 176);
    for (const s0 of lit) {
      if (seen[s0]) continue;
      const g = [s0]; seen[s0] = 1;
      for (let k = 0; k < g.length; k++) {
        const p = g[k], x = p & 255, y = p >> 8;
        for (const q of [x > 0 ? p - 1 : -1, x < 255 ? p + 1 : -1, y > 0 ? p - 256 : -1, y < 175 ? p + 256 : -1]) {
          if (q >= 0 && !seen[q] && inLit[q] && sim[q] === sim[s0]) { seen[q] = 1; g.push(q); }
        }
      }
      const target = majority(g.map((p) => penOf[p]));
      if (target === sim[s0]) continue;
      const inG = new Uint8Array(256 * 176);
      for (const p of g) inG[p] = 1;
      const interior = (p) => { const x = p & 255, y = p >> 8; return x > 0 && x < 255 && y > 0 && y < 175 && inG[p - 1] && inG[p + 1] && inG[p - 256] && inG[p + 256]; };
      const seed = inG[seedS] ? seedS : g.find(interior) ?? g[0];
      const reg = region(seed);
      // el relleno del CPC llega hasta donde cambia la tinta: si se escaparía
      // de la zona, se pinta a rayas horizontales
      const leak = reg.edge || reg.list.filter((p) => !inG[p]).length > 4;
      setPen(target);
      if (!leak && g.length > 1) {
        const dx = (seed & 255) - cx, dy = (seed >> 8) - cy;
        out.push(relCode(0x0a, dx, dy), Math.abs(dx) & 255, Math.abs(dy));
        for (const p of reg.list) sim[p] = target;
        continue;
      }
      const rows = new Map();
      for (const p of g) { const y = p >> 8; if (!rows.has(y)) rows.set(y, []); rows.get(y).push(p & 255); }
      const ox = cx, oy = cy;
      for (const [y, xs] of [...rows].sort((a, b) => b[0] - a[0])) {
        xs.sort((a, b) => a - b);
        for (let i = 0; i < xs.length;) {
          let j = i;
          while (j + 1 < xs.length && xs[j + 1] === xs[j] + 1) j++;
          if (j > i) { moveTo(xs[i], y); lineTo(xs[j], y); }
          else { const [X, Y] = xy(xs[i], y); out.push(0x46 | ((X >> 8) << 7), X & 255, Y); cx = xs[i]; cy = y; }
          for (let k = i; k <= j; k++) sim[xs[k] | (y << 8)] = target;
          i = j + 1;
        }
      }
      moveTo(ox, oy);
    }
  }
  out.push(0x40);
  // pens: la tinta que debería tener cada punto (para las pruebas)
  return { data: out, inks, pens: penOf, window: { r0, r1, c0, c1 } };

  function moveRel(x, y) {
    // mover relativo: se lleva el punto actual a donde queda el del Spectrum
    if (x === cx && y === cy) return;
    let dx = x - cx, dy = y - cy;
    while (dx || dy) {
      const sx = Math.max(-511, Math.min(511, dx)), sy = Math.max(-255, Math.min(255, dy));
      out.push(relCode(0x08, sx, sy), Math.abs(sx) & 255, Math.abs(sy));
      dx -= sx; dy -= sy;
    }
    cx = x; cy = y;
  }
}

// Ventana de un dibujo en el CPC: las columnas del Spectrum (42) pasan a 40
function cpcWindow(p) {
  const col = Math.min(39, Math.round((p.col ?? 0) * 40 / 42));
  const width = Math.max(1, Math.min(40 - col, Math.round((p.width ?? 42) * 40 / 42)));
  return [Math.min(24, p.line ?? 0), col, Math.max(1, Math.min(25, p.height ?? 12)), width];
}

// La base completa. pictures: dibujos del modelo por número ({ drawstring,
// location, paper, ink, line, col, height, width } o null). charset: 2048
// bytes. Devuelve { bytes, load, converted, skipped } (load = dirección).
export function buildCpcGfx(pictures, charset) {
  const cs = Uint8Array.from(charset);
  const pics = pictures.map((p) => (p && p.drawstring ? Uint8Array.from(p.drawstring) : null));
  // caracteres para las tramas: los del juego si ya valen, si no, del 255 hacia abajo
  const shades = new Map();
  let free = 255;
  const shadeChar = (ch, inverse) => {
    const key = ch + (inverse ? ':i' : '');
    if (shades.has(key)) return shades.get(key);
    const rows = Array.from(cs.subarray(ch * 8, ch * 8 + 8), (v) => {
      const n = ((inverse ? ~v : v) >> 4) & 15;          // los 4 puntos de la izquierda
      return (n << 4) | n;                               // modo 1: los dos bits de cada punto
    });
    let at = ch;
    if (!rows.every((v, i) => cs[ch * 8 + i] === v)) {
      if (free < 128) return ch;
      at = free--;
      cs.set(rows, at * 8);
    }
    shades.set(key, at);
    return at;
  };
  const entries = [], previews = [];
  let converted = 0, skipped = 0;
  pictures.forEach((p, n) => {
    if (!p) { entries.push({ data: [0x40], win: [0x80, 0x1a, 0x02, 0x06, 0, 0, 12, 40] }); return; }
    if (p.location === false) { entries.push({ data: [0x40], win: [0x80, 0x1a, 0x02, 0x06, 0, 0, 12, 40] }); return; }
    const w = cpcWindow(p);
    if (!p.drawstring) { skipped++; entries.push({ data: [0x40], win: [TEXT_INKS[0], TEXT_INKS[1], 2, 6, ...w] }); return; }
    const r = convertPicture(pics, n, p, cs, shadeChar);
    previews[n] = { inks: r.inks, pens: r.pens, window: r.window };
    converted++;
    entries.push({ data: r.data, win: [r.inks[0], r.inks[1], r.inks[2], r.inks[3], ...w] });
  });
  if (!entries.length) entries.push({ data: [0x40], win: [0x80, 0x1a, 0x02, 0x06, 0, 0, 12, 40] });

  const dataLen = entries.reduce((a, e) => a + e.data.length, 0);
  const ptrLen = 2 * (entries.length + 2), winLen = 8 * entries.length + 1;
  const start = 0x9de0 - winLen - ptrLen - dataLen;
  const b = new Uint8Array(CPC_END - start);
  const at = (a) => a - start;
  const w16 = (a, v) => { b[at(a)] = v & 255; b[at(a) + 1] = v >> 8; };
  let a = start;
  const ptrs = entries.map((e) => { const p = a; b.set(e.data, at(a)); a += e.data.length; return p; });
  const ptrTable = a;
  for (const p of ptrs) { w16(a, p); a += 2; }
  w16(a, ptrTable); a += 2;
  w16(a, 0xffff); a += 2;
  const winTable = a;
  for (const e of entries) { b.set(e.win, at(a)); a += 8; }
  const winEnd = a;
  b[at(a)] = 0xff; a++;
  if (a !== 0x9de0) throw new Error('base de gráficos de CPC mal calculada');
  b.fill(0xff, at(0x9de0), at(0x9de8));
  b.set([0, TEXT_INKS[0], TEXT_INKS[1], 2, 6, 0, 0x40], at(0x9de8));
  [start, ptrTable, winTable, winEnd, 0x9de0, 0x9de8, 0xffff].forEach((v, i) => w16(PTRS_AT + 2 * i, v));
  b[at(0x9dfd)] = entries.length;
  b.set(cs, at(CHARSET_AT));
  return { bytes: b, load: start, converted, skipped, previews };
}
