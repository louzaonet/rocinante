// Base de gráficos de DAAD para MSX (DAAD.MDG) a partir de los dibujos
// vectoriales del Spectrum.
//
// El MSX de DAAD usa las mismas órdenes de dibujo que el Spectrum (las pinta
// en SCREEN 2, que tiene colores por cada línea de 8 puntos, y el intérprete
// imita los cuadros de 8x8 del Spectrum). Lo que cambia, igual que hacía DSM,
// el conversor de DAAD:
//   INK y PAPER llevan el color del MSX (0-15) en lugar del del Spectrum; el
//     transparente (8) pasa a ser 16
//   BRIGHT y FLASH desaparecen; aquí, a diferencia de DSM, el color brillante
//     se tiene en cuenta al convertir los INK y PAPER que vienen detrás
//   la LINE corta del Spectrum (bit 5, dx y dy en un byte) no existe en el
//     MSX: pasa a la normal, de 3 bytes
// Estructura (acaba en B000h; la carga el cartucho, ver msxcart.js):
//   órdenes de los dibujos
//   tabla de punteros: uno por dibujo, el de esa tabla y FFFFh
//   ventanas: 6 bytes por dibujo (80h si es de localidad, color con la tinta
//     en el nibble alto y el papel en el bajo, línea, columna, alto y ancho)
//     y FFh
//   juego de caracteres (2048 bytes; también son las tramas)
//   tabla de colores: 0, los 8 colores normales del Spectrum en el MSX, los 8
//     brillantes, 0, 0
//   AFEFh: punteros a datos, punteros, ventanas, fin de ventanas, caracteres,
//     tabla de colores, FFFFh, nº de dibujos (2 bytes), 0

export const MSX_END = 0xb000;
// Colores del MSX para los del Spectrum: normales y brillantes (el 0 del MSX
// es transparente: deja ver el fondo, que es negro)
export const MSX_NORMAL = [0, 4, 6, 13, 12, 7, 10, 14];
export const MSX_BRIGHT = [0, 5, 9, 13, 3, 7, 11, 15];

const cmdLen = (c) => {
  const op = c & 7;
  return op === 0 ? 3 : op === 1 ? (c & 0x20 ? 2 : 3) : op === 2 ? (c === 0x12 ? 5 : c & 0x20 ? 4 : 3) : op === 3 ? 2 : op === 4 ? 4 : 1;
};

// Una cadena de órdenes del Spectrum en el formato del MSX
export function convertDrawstring(d) {
  const out = [];
  let bright = 0;
  for (let i = 0; i < d.length;) {
    const c = d[i], op = c & 7;
    if (op === 7) { out.push(7); break; }
    const n = cmdLen(c);
    if (op === 5 || op === 6) {
      const v = (c >> 3) & 15;
      if (c & 0x80) {
        // BRIGHT (5) o FLASH (6): fuera; el brillo se recuerda
        if (op === 5 && v <= 1) bright = v;
      } else {
        const msx = v === 8 ? 16 : v < 8 ? (bright ? MSX_BRIGHT : MSX_NORMAL)[v] : null;
        if (msx !== null) out.push(op | (msx << 3));
      }
    } else if (op === 1 && (c & 0x20)) {
      out.push(c & ~0x20, d[i + 1] >> 4, d[i + 1] & 15);
    } else out.push(...d.slice(i, i + n));
    i += n;
  }
  if (out[out.length - 1] !== 7) out.push(7);
  return out;
}

// pictures: los dibujos del modelo por número (null donde no hay). Los mapas
// de bits no salen (el intérprete solo pinta vectoriales): su localidad se
// queda con la ventana borrada al color de papel.
export function buildMDG(pictures, charset) {
  let skipped = 0, converted = 0;
  const list = Array.from({ length: Math.max(1, pictures.length) }, (_, i) => pictures[i] || null).map((p) => {
    if (p && !p.drawstring && p.location !== false) skipped++;
    if (p && p.drawstring && p.location !== false) converted++;
    return p ? {
      data: p.drawstring ? convertDrawstring(p.drawstring) : [7], location: p.location !== false,
      paper: p.paper ?? 0, ink: p.ink ?? 7, line: p.line ?? 0, col: p.col ?? 0, height: p.height ?? 12, width: p.width ?? 42,
    } : { data: [7], location: false, paper: 0, ink: 7, line: 0, col: 0, height: 1, width: 1 };
  });
  // los dibujos iguales comparten los datos
  const firstOf = new Map();
  const shared = list.map((p, i) => { const k = p.data.join(','); if (!firstOf.has(k)) firstOf.set(k, i); return firstOf.get(k); });
  const dataLen = list.reduce((a, p, i) => a + (shared[i] === i ? p.data.length : 0), 0);
  const ptrLen = 2 * (list.length + 2), winLen = 6 * list.length + 1;
  const size = dataLen + ptrLen + winLen + 2048 + 19 + 17;
  const start = MSX_END - size;
  const b = new Uint8Array(size);
  const at = (a) => a - start;
  const w16 = (a, v) => { b[at(a)] = v & 255; b[at(a) + 1] = v >> 8; };
  let a = start;
  const ptrs = [];
  list.forEach((p, i) => {
    if (shared[i] !== i) { ptrs.push(ptrs[shared[i]]); return; }
    ptrs.push(a); b.set(p.data, at(a)); a += p.data.length;
  });
  const ptrTable = a;
  for (const p of ptrs) { w16(a, p); a += 2; }
  w16(a, ptrTable); a += 2;
  w16(a, 0xffff); a += 2;
  const winTable = a;
  for (const p of list) {
    b.set([p.location ? 0x80 : 0, (MSX_NORMAL[p.ink & 7] << 4) | MSX_NORMAL[p.paper & 7], p.line, p.col, p.height, p.width], at(a));
    a += 6;
  }
  const winEnd = a;
  b[at(a)] = 0xff; a += 1;
  const cs = a;
  b.set(charset.subarray(0, 2048), at(a)); a += 2048;
  const colours = a;
  b.set([0, ...MSX_NORMAL, ...MSX_BRIGHT, 0, 0], at(a)); a += 19;
  if (a !== MSX_END - 17) throw new Error('MDG mal calculado');
  [start, ptrTable, winTable, winEnd, cs, colours, 0xffff, list.length].forEach((v, k) => w16(a + 2 * k, v));
  b[at(a + 16)] = 0;
  return { bytes: b, start, converted, skipped };
}
