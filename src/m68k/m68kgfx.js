// Dibujos de Rocinante para DAAD en Amiga y Atari ST: imágenes de 16 colores
// en la base PART1.DAT (ver dat.js).
//
// Los intérpretes de 16 bits no pintan órdenes vectoriales: cada dibujo es una
// imagen. Las coordenadas son las del Spectrum (el texto también va en
// columnas de 6 puntos y filas de 8, solo que la pantalla es de 320x200):
//   vectoriales: se pintan como en el Spectrum, con su ventana borrada al
//     papel, y se toma esa ventana (filas line..line+height-1) de 256 puntos
//     de ancho
//   mapas de bits: el rectángulo de la versión Spectrum (cx, cy, cw, ch); si
//     hay maestra y quien llama sabe decodificarla (en el navegador, con un
//     canvas), se usa la maestra reducida a ese tamaño y pasada a 16 colores;
//     si no, la versión Spectrum
// Los colores 0 (negro, el papel) y 15 (blanco, la tinta) son los del texto
// y no cambian.

import { Painter } from '../gfx/drawstring.js';
import { ZX_PALETTE } from '../web/view.js';

const rowAddr = (y) => ((y & 0xc0) << 5) | ((y & 7) << 8) | ((y & 0x38) << 2);
// color de 8 bits por canal a 0RGB de 3 bits
export const to9 = ([r, g, b]) => (Math.round(r * 7 / 255) << 8) | (Math.round(g * 7 / 255) << 4) | Math.round(b * 7 / 255);
export const from9 = (c) => [((c >> 8) & 7) * 255 / 7, ((c >> 4) & 7) * 255 / 7, (c & 7) * 255 / 7];
// papel y tinta del texto: colores 0 y 15
export const PAPER = 0x000, INK = 0x777;

// Paleta fija para lo que viene del Spectrum: negro (0), los 7 colores
// normales (1-7), los 6 brillantes que faltan (8-13), uno libre (14) y el
// blanco brillante (15), que es el del texto
const ZX_LIST = [[0, 0], ...[1, 2, 3, 4, 5, 6, 7].map((c) => [0, c]), ...[1, 2, 3, 4, 5, 6].map((c) => [1, c]), [0, 0], [1, 7]];
export const ZX_PALETTE16 = ZX_LIST.map(([b, c]) => to9((b ? ZX_PALETTE.bright : ZX_PALETTE.normal)[c]));
const zxIndex = (bright, c) => (c === 0 ? 0 : bright && c === 7 ? 15 : ZX_LIST.findIndex(([b, k]) => b === (bright ? 1 : 0) && k === c));

// Índices (0-15) de un trozo de la memoria del Spectrum
function fromMem(mem, x0, y0, width, height) {
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const sy = y0 + y, a = rowAddr(sy);
    for (let x = 0; x < width; x++) {
      const sx = x0 + x;
      const at = mem[6144 + (sy >> 3) * 32 + (sx >> 3)];
      const set = mem[a + (sx >> 3)] & (0x80 >> (sx & 7));
      out[y * width + x] = zxIndex(at & 0x40, set ? at & 7 : (at >> 3) & 7);
    }
  }
  return out;
}

// Dibujo vectorial n (de la lista de dibujos del modelo) como imagen
export function renderVector(pictures, n, charset) {
  const pic = pictures[n];
  const mem = new Uint8Array(6912);
  const attr = ((pic.paper & 7) << 3) | (pic.ink & 7);
  mem.fill(attr, 6144);
  const lib = pictures.map((d) => (d && d.drawstring ? { data: d.drawstring } : null));
  const p = new Painter(mem, lib, { kind: 'daad', charset });
  p.setColours(attr);
  p.run(n);
  const line = Math.max(0, Math.min(21, pic.line ?? 0));
  const height = Math.max(1, Math.min(22 - line, pic.height ?? 12));
  return { x: 0, y: line * 8, width: 256, height: height * 8, pixels: fromMem(mem, 0, line * 8, 256, height * 8), palette: ZX_PALETTE16 };
}

// Rectángulo en x múltiplo de 16 y ancho múltiplo de 16 (lo que pide el
// formato de planos del ST) que cubre cx..cx+cw columnas de 8 puntos
const span16 = (cx, cw) => { const x = (cx * 8) & ~15; return { x, width: ((cx + cw) * 8 + 15 & ~15) - x }; };

// Mapa de bits del Spectrum como imagen
export function renderZX(pic) {
  const { cx, cy, cw, ch, pixels, attrs } = pic.zx;
  const mem = new Uint8Array(6912);
  for (let y = 0; y < ch * 8; y++) mem.set(pixels.subarray(y * cw, (y + 1) * cw), rowAddr(cy * 8 + y) + cx);
  for (let r = 0; r < ch; r++) mem.set(attrs.subarray(r * cw, (r + 1) * cw), 6144 + (cy + r) * 32 + cx);
  const { x, width } = span16(cx, cw);
  return { x, y: cy * 8, width, height: ch * 8, pixels: fromMem(mem, x, cy * 8, width, ch * 8), palette: ZX_PALETTE16 };
}

// Reduce una imagen RGBA a 16 colores de 9 bits, con negro y blanco fijos en
// 0 y 15: corte por la mediana sobre los colores ya pasados a 9 bits y, con
// dither, difusión del error (Floyd-Steinberg) para que los degradados no
// salgan a bandas. Si todos los colores de la imagen, pasados a 9 bits, caben
// en la paleta (la de un dibujo del Spectrum, por ejemplo), no se trama.
export function quantize(rgba, width, height, { dither = true } = {}) {
  const n = width * height;
  const c9 = new Uint16Array(n);
  const count = new Map();
  for (let i = 0; i < n; i++) {
    const c = to9([rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]]);
    c9[i] = c;
    count.set(c, (count.get(c) || 0) + 1);
  }
  const fixed = new Set([PAPER, INK]);
  let boxes = [[...count.keys()].filter((c) => !fixed.has(c))];
  const ch = (c, k) => (c >> (8 - 4 * k)) & 7;
  while (boxes.length < 14) {
    // la caja con más puntos que se pueda partir, por su canal más largo
    let best = -1, weight = 0;
    boxes.forEach((b, i) => { const w = b.reduce((a, c) => a + count.get(c), 0); if (b.length > 1 && w > weight) { weight = w; best = i; } });
    if (best < 0) break;
    const b = boxes[best];
    const ranges = [0, 1, 2].map((k) => Math.max(...b.map((c) => ch(c, k))) - Math.min(...b.map((c) => ch(c, k))));
    const k = ranges.indexOf(Math.max(...ranges));
    b.sort((p, q) => ch(p, k) - ch(q, k));
    let acc = 0, cut = 1;
    for (let i = 0; i < b.length - 1; i++) { acc += count.get(b[i]); if (acc * 2 >= weight) { cut = i + 1; break; } cut = i + 1; }
    boxes.splice(best, 1, b.slice(0, cut), b.slice(cut));
  }
  const palette = [PAPER];
  for (const b of boxes) {
    if (!b.length) continue;
    let w = 0, r = 0, g = 0, bl = 0;
    for (const c of b) { const k = count.get(c); w += k; r += ch(c, 0) * k; g += ch(c, 1) * k; bl += ch(c, 2) * k; }
    palette.push((Math.round(r / w) << 8) | (Math.round(g / w) << 4) | Math.round(bl / w));
  }
  while (palette.length < 15) palette.push(0);
  palette.push(INK);
  const pal8 = palette.map(from9);
  const nearest = (r, g, b) => {
    let best = 0, d = Infinity;
    pal8.forEach(([pr, pg, pb], i) => {
      const e = (r - pr) ** 2 * 3 + (g - pg) ** 2 * 4 + (b - pb) ** 2 * 2;
      if (e < d) { d = e; best = i; }
    });
    return best;
  };
  const pixels = new Uint8Array(n);
  const exact = [...count.keys()].every((c) => palette.includes(c));
  if (!dither || exact) {
    const near = new Map();
    for (let i = 0; i < n; i++) {
      if (!near.has(c9[i])) near.set(c9[i], nearest(...from9(c9[i])));
      pixels[i] = near.get(c9[i]);
    }
    return { pixels, palette };
  }
  const work = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) work[i * 3 + k] = rgba[i * 4 + k];
  const spread = (x, y, e, f) => {
    if (x < 0 || x >= width || y >= height) return;
    const j = (y * width + x) * 3;
    for (let k = 0; k < 3; k++) work[j + k] += e[k] * f;
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const v = [0, 1, 2].map((k) => Math.max(0, Math.min(255, work[i * 3 + k])));
      const p = nearest(...v);
      pixels[i] = p;
      const e = v.map((c, k) => c - pal8[p][k]);
      spread(x + 1, y, e, 7 / 16); spread(x - 1, y + 1, e, 3 / 16); spread(x, y + 1, e, 5 / 16); spread(x + 1, y + 1, e, 1 / 16);
    }
  }
  return { pixels, palette };
}

// Todas las imágenes de los dibujos de localidad. decode(master, w, h) ->
// Promise<RGBA de w x h> o null (sin decodificador se usa la versión Spectrum).
// Devuelve { images, converted, skipped }
export async function buildImages(pictures, { charset, decode = null } = {}) {
  const images = [];
  let converted = 0, skipped = 0;
  for (let n = 0; n < pictures.length; n++) {
    const pic = pictures[n];
    if (!pic || pic.location === false) continue;
    let im = null;
    if (pic.zx) {
      im = renderZX(pic);
      if (pic.master && decode) {
        const { cx, cy, cw, ch } = pic.zx;
        const rgba = await decode(pic.master, cw * 8, ch * 8).catch(() => null);
        if (rgba) {
          // la maestra va en su rectángulo; lo que sobra por el ajuste a 16
          // puntos, en negro
          const q = quantize(rgba, cw * 8, ch * 8);
          const pixels = new Uint8Array(im.width * im.height);
          const dx = cx * 8 - im.x;
          for (let y = 0; y < ch * 8; y++) pixels.set(q.pixels.subarray(y * cw * 8, (y + 1) * cw * 8), y * im.width + dx);
          im = { ...im, pixels, palette: q.palette };
        }
      }
    } else if (pic.drawstring) {
      im = renderVector(pictures, n, charset);
    }
    if (!im) { skipped++; continue; }
    converted++;
    images.push({ n, ...im });
  }
  return { images, converted, skipped };
}
