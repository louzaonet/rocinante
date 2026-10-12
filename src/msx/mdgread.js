// Lectura de juegos de DAAD para MSX: la memoria de un cartucho de Rocinante
// y la base de gráficos (DAAD.MDG, ver msxgfx.js), que se pasa a dibujos del
// Spectrum.

import { MSX_CART } from './msxload-bin.js';
import { opLen } from '../gfx/vector.js';

// Memoria (64K) tal como la deja el arranque de un cartucho de Rocinante: la
// tabla de trozos va detrás del código de arranque (6 bytes y luego 7 por
// trozo: banco, origen, destino y largo). null si no lo es.
export function cartridgeMemory(rom) {
  if (rom[0] !== 0x41 || rom[1] !== 0x42) return null;
  const t = MSX_CART.length;
  if (rom.length < t + 6) return null;
  const mem = new Uint8Array(65536);
  let n = 0;
  for (let o = t + 6; o + 7 <= rom.length; o += 7) {
    const [bank, s0, s1, d0, d1, l0, l1] = rom.subarray(o, o + 7);
    const len = l0 | (l1 << 8);
    if (!len) break;
    const src = bank * 0x4000 + (s0 | (s1 << 8)), dest = d0 | (d1 << 8);
    if (src + len > rom.length || dest + len > 0x10000) return null;
    mem.set(rom.subarray(src, src + len), dest);
    n++;
  }
  return n ? mem : null;
}

// Base de gráficos que acaba en B000h (punteros en AFEFh). Devuelve como
// readSDG: { pictures, charset, colourMap } con las órdenes y los colores ya
// del Spectrum, o null.
export function readMDG(mem) {
  const w = (a) => mem[a] | (mem[a + 1] << 8);
  const P = 0xafef;
  const data = w(P), ptrs = w(P + 2), wins = w(P + 4), winEnd = w(P + 6), cs = w(P + 8), colours = w(P + 10), n = w(P + 14);
  if (!n || n > 256 || !(data >= 0x100 && data <= ptrs && ptrs < wins && wins + 6 * n === winEnd && winEnd < cs && cs + 2048 <= colours && colours < P)) return null;
  // colores del MSX -> del Spectrum (normal o brillante), por la tabla
  const normal = mem.subarray(colours + 1, colours + 9), bright = mem.subarray(colours + 9, colours + 17);
  const toZX = (v) => {
    let k = Array.prototype.indexOf.call(normal, v);
    if (k >= 0) return { c: k, b: 0 };
    k = Array.prototype.indexOf.call(bright, v);
    return k >= 0 ? { c: k, b: 1 } : null;
  };
  const pictures = [];
  for (let i = 0; i < n; i++) {
    const a = w(ptrs + 2 * i);
    if (a < data || a >= ptrs) return null;
    const d = [];
    let bright = 0;
    for (let k = a; k < ptrs;) {
      const c = mem[k], op = c & 7;
      if (op === 7) { d.push(7); break; }
      if (op === 5 || op === 6) {
        // INK y PAPER llevan el color del MSX (16 = transparente)
        const v = c >> 3;
        if (v === 16) d.push(op | (8 << 3));
        else {
          const z = toZX(v);
          if (z) {
            if (z.b !== bright) { d.push(5 | 0x80 | (z.b << 3)); bright = z.b; }
            d.push(op | (z.c << 3));
          }
        }
        k += 1;
        continue;
      }
      // en el MSX no hay LINE corta (el bit 5 no cuenta)
      const len = op === 1 ? 3 : opLen(mem, k);
      for (let j = 0; j < len; j++) d.push(mem[k + j]);
      k += len;
    }
    const at = wins + 6 * i, col = mem[at + 1];
    const ink = toZX(col >> 4), paper = toZX(col & 15);
    pictures.push({
      number: i, data: d, location: !!(mem[at] & 0x80), ink: ink ? ink.c : 7, paper: paper ? paper.c : 0,
      line: mem[at + 2], col: mem[at + 3], height: mem[at + 4], width: mem[at + 5],
    });
  }
  return { pictures, charset: mem.slice(cs, cs + 2048), colourMap: [0, 1, 2, 3, 4, 5, 6, 7] };
}
