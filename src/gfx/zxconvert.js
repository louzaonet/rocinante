// Conversión de una imagen en color a pantalla de Spectrum: píxeles de 1 bit
// y atributos por celda de 8x8 (dos colores por celda, con o sin brillo).
//
// rgba: Uint8ClampedArray de w*h*4 ya escalado a cw*8 x ch*8 píxeles.
// Devuelve { cw, ch, pixels: Uint8Array(ch*8*cw) por filas, attrs: Uint8Array(cw*ch) }.

import { ZX_PALETTE } from '../web/view.js';

const BAYER = [
  [0, 32, 8, 40, 2, 34, 10, 42], [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44, 4, 36, 14, 46, 6, 38], [60, 28, 52, 20, 62, 30, 54, 22],
  [3, 35, 11, 43, 1, 33, 9, 41], [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47, 7, 39, 13, 45, 5, 37], [63, 31, 55, 23, 61, 29, 53, 21],
].map((r) => r.map((v) => (v + 0.5) / 64));

export function convertToZX(rgba, cw, ch, { dither = true, allowBright = true, contrast = 1 } = {}) {
  const W = cw * 8;
  const pixels = new Uint8Array(ch * 8 * cw);
  const attrs = new Uint8Array(cw * ch);
  const px = (x, y) => {
    const i = (y * W + x) * 4;
    const f = (v) => Math.max(0, Math.min(255, (v - 128) * contrast + 128));
    return [f(rgba[i]), f(rgba[i + 1]), f(rgba[i + 2])];
  };
  const brights = allowBright ? [0, 1] : [0];
  for (let cy = 0; cy < ch; cy++) {
    for (let cx = 0; cx < cw; cx++) {
      const cell = [];
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) cell.push(px(cx * 8 + x, cy * 8 + y));
      let best = null;
      for (const br of brights) {
        const pal = br ? ZX_PALETTE.bright : ZX_PALETTE.normal;
        for (let a = 0; a < 8; a++) {
          for (let b = a; b < 8; b++) {
            if (br && a === 0 && b === 0) continue;
            const r = renderCell(cell, pal[a], pal[b], dither);
            if (!best || r.err < best.err) best = { ...r, a, b, br };
          }
        }
      }
      // ink = color b (bits a 1), paper = color a
      attrs[cy * cw + cx] = (best.br << 6) | (best.a << 3) | best.b;
      for (let y = 0; y < 8; y++) pixels[(cy * 8 + y) * cw + cx] = best.bits[y];
    }
  }
  return { cw, ch, pixels, attrs };
}

// Mejor forma de pintar la celda con dos colores: cada píxel se proyecta sobre
// el segmento entre ambos y se decide con la matriz de Bayer.
function renderCell(cell, c0, c1, dither) {
  const d = [c1[0] - c0[0], c1[1] - c0[1], c1[2] - c0[2]];
  const dd = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
  const bits = new Uint8Array(8);
  let err = 0;
  for (let i = 0; i < 64; i++) {
    const p = cell[i], x = i & 7, y = i >> 3;
    let t = 0;
    if (dd > 0) t = ((p[0] - c0[0]) * d[0] + (p[1] - c0[1]) * d[1] + (p[2] - c0[2]) * d[2]) / dd;
    t = Math.max(0, Math.min(1, t));
    // error del color "mezclado" (lo que percibe el ojo) más un poco del puro
    const mix = [c0[0] + d[0] * t, c0[1] + d[1] * t, c0[2] + d[2] * t];
    err += (p[0] - mix[0]) ** 2 + (p[1] - mix[1]) ** 2 + (p[2] - mix[2]) ** 2;
    const on = dither ? t > BAYER[y][x] : t > 0.5;
    if (!dither) {
      const q = on ? c1 : c0;
      err += ((p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2) * 0.5;
    }
    if (on) bits[y] |= 0x80 >> x;
  }
  return { err, bits };
}

// Pinta un mapa de bits de Spectrum en RGBA (para previsualizar)
export function zxToRGBA(bm) {
  const W = bm.cw * 8, H = bm.ch * 8;
  const out = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const at = bm.attrs[(y >> 3) * bm.cw + (x >> 3)];
      const pal = at & 0x40 ? ZX_PALETTE.bright : ZX_PALETTE.normal;
      const on = bm.pixels[y * bm.cw + (x >> 3)] & (0x80 >> (x & 7));
      const c = pal[on ? at & 7 : (at >> 3) & 7];
      const i = (y * W + x) * 4;
      out[i] = c[0]; out[i + 1] = c[1]; out[i + 2] = c[2]; out[i + 3] = 255;
    }
  }
  return out;
}

// Escalado sencillo por áreas (para cuando no hay canvas, p. ej. en Node)
export function resizeRGBA(src, sw, sh, dw, dh) {
  const out = new Uint8ClampedArray(dw * dh * 4);
  for (let y = 0; y < dh; y++) {
    const y0 = Math.floor(y * sh / dh), y1 = Math.max(y0 + 1, Math.floor((y + 1) * sh / dh));
    for (let x = 0; x < dw; x++) {
      const x0 = Math.floor(x * sw / dw), x1 = Math.max(x0 + 1, Math.floor((x + 1) * sw / dw));
      let r = 0, g = 0, b = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) {
        const i = (yy * sw + xx) * 4; r += src[i]; g += src[i + 1]; b += src[i + 2]; n++;
      }
      const o = (y * dw + x) * 4;
      out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = 255;
    }
  }
  return out;
}
