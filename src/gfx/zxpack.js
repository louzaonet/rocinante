// Compresión de dibujos en mapa de bits para la extensión xbank (128K).
//
// Formato: cx, cy, cw, ch (celdas) y después, fila de píxeles a fila de
// píxeles (ch*8 filas de cw bytes) y luego las filas de atributos (ch filas),
// una secuencia de órdenes que nunca cruza de una fila a otra:
//   0nnnnnnn          n+1 bytes literales a continuación
//   1nnnnnnn lo hi    copiar n+2 bytes desde la dirección de pantalla hi:lo
// La copia es byte a byte hacia delante, así que copiar desde dest-1 repite.
// Las direcciones son las reales de la pantalla (4000h...), por eso el
// descompresor no necesita memoria intermedia.

const rowAddr = (y) => 0x4000 | ((y & 0xc0) << 5) | ((y & 7) << 8) | ((y & 0x38) << 2);

export function packBitmap(bm, cx, cy) {
  const { cw, ch, pixels, attrs } = bm;
  const screen = new Map();          // dirección -> byte ya escrito
  const out = [cx, cy, cw, ch];
  const rows = [];
  for (let y = 0; y < ch * 8; y++) rows.push({ addr: rowAddr(cy * 8 + y) + cx, data: pixels.subarray(y * cw, (y + 1) * cw) });
  for (let r = 0; r < ch; r++) rows.push({ addr: 0x5800 + (cy + r) * 32 + cx, data: attrs.subarray(r * cw, (r + 1) * cw) });

  // índice de triples de bytes ya escritos para buscar copias deprisa
  const index = new Map();
  const write = (a, v) => {
    screen.set(a, v);
    for (let s = a - 2; s <= a; s++) {
      const x = screen.get(s), y = screen.get(s + 1), z = screen.get(s + 2);
      if (x === undefined || y === undefined || z === undefined) continue;
      const k = (x << 16) | (y << 8) | z;
      let l = index.get(k);
      if (!l) index.set(k, (l = []));
      if (l[l.length - 1] !== s) l.push(s);
    }
  };
  for (const { addr, data } of rows) {
    let i = 0, lit = [];
    const flushLit = () => {
      while (lit.length) { const n = Math.min(128, lit.length); out.push(n - 1, ...lit.slice(0, n)); lit = lit.slice(n); }
    };
    const valueAt = (src, k) => {
      const a = src + k;
      if (a >= addr + i && a < addr + i + k) return data[a - addr];
      return screen.get(a);
    };
    const tryCopy = (src) => {
      let len = 0;
      while (i + len < data.length && len < 129 && valueAt(src, len) === data[i + len]) len++;
      return len;
    };
    while (i < data.length) {
      let bestLen = 0, bestSrc = 0;
      const cands = [];
      if (i > 0) cands.push(addr + i - 1);                    // repetición del byte anterior
      if (i + 2 < data.length) {
        const l = index.get((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
        if (l) for (let j = l.length - 1, n = 0; j >= 0 && n < 64; j--, n++) cands.push(l[j]);
      }
      for (const src of cands) {
        const len = tryCopy(src);
        if (len > bestLen) { bestLen = len; bestSrc = src; }
      }
      if (bestLen >= 4) {
        flushLit();
        out.push(0x80 | (bestLen - 2), bestSrc & 255, bestSrc >> 8);
        for (let k = 0; k < bestLen; k++) write(addr + i + k, data[i + k]);
        i += bestLen;
      } else {
        lit.push(data[i]);
        write(addr + i, data[i]);
        i++;
      }
    }
    flushLit();
  }
  return Uint8Array.from(out);
}
