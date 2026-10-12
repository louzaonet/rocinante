// Base de gráficos de DAAD para Amiga y Atari ST (PART1.DAT): imágenes de 16
// colores, no órdenes vectoriales. Formato (palabras con el byte alto primero):
//   cabecera: 0300h, modo (0 = 320x200), nº de imágenes, tamaño del fichero (4)
//   256 entradas de 48 bytes, una por número de dibujo:
//     desplazamiento de la imagen (4; 0 = no hay), flags (2; 4 = fija),
//     x, y (2 y 2), primer y último color de la paleta que se aplica (1 y 1),
//     16 colores (2 cada uno, 0RGB de 3 bits) y 4 bytes más
//   cada imagen: ancho (bit 15 = comprimida), alto, tamaño de los datos (2 cada
//   uno) y los datos:
//     sin comprimir: en planos como la pantalla del ST, cada 8 puntos sus 4
//     bytes (plano 0 a 3)
//     comprimida: una máscara de 16 bits (qué colores van comprimidos) y los
//     puntos de izquierda a derecha y de arriba abajo, un nibble por punto; tras
//     un color comprimido, otro nibble con cuántas veces más se repite (0-15).
//     Los nibbles se juntan de 8 en 8 en palabras largas, el primero en los
//     bits bajos.
// (Formato de DMG, el gestor de imágenes de DAAD; descrito en img2daad, de DAAD
// Ready. La implementación es propia.)
//
// El PC (intérpretes INTSM e INTEM) lee el mismo fichero con el byte bajo
// primero (menos los colores de la paleta) y firma FFFFh, y los puntos siempre
// en nibbles, sin planos (sacado de la rutina que pinta los dibujos en INTSM1).

export const ENTRY = 48, HEADER = 10;
// Paleta de las entradas sin imagen, la de la base vacía de DAAD
export const DEFAULT_PALETTE = [0x888, 0x1fff, 0x2999, 0x3222, 0x4aaa, 0x5333, 0x6bbb, 0x7444, 0x8ccc, 0x9555, 0xaddd, 0xb666, 0xc666, 0xdeee, 0xe777, 0xf111];
const DEFAULT_TAIL = [0x3f, 0xfa, 0xaa, 0xac];

// Puntos (índices 0-15, ancho x alto) a planos del ST
export function planar(pixels, width, height) {
  const cols = width >> 3, out = new Uint8Array(cols * height * 4);
  let o = 0;
  for (let y = 0; y < height; y++) {
    for (let c = 0; c < cols; c++) {
      for (let p = 0; p < 4; p++) {
        let b = 0;
        for (let k = 0; k < 8; k++) if (pixels[y * width + c * 8 + k] & (1 << p)) b |= 0x80 >> k;
        out[o++] = b;
      }
    }
  }
  return out;
}

// Nibbles de la compresión de DMG: cada punto un nibble; tras un color de
// la máscara, otro con cuántas veces más se repite (0-15). mask = null:
// elige los colores que salen a cuenta; 0: sin comprimir (el formato del PC)
function nibbles(pixels, mask = null) {
  if (mask === null) {
    const runs = [];
    for (let n = 0; n < pixels.length;) {
      const c = pixels[n++];
      let r = 0;
      while (n < pixels.length && pixels[n] === c && r < 15) { n++; r++; }
      runs.push([c, r]);
    }
    // un color va comprimido si sus pares (color, repeticiones) ocupan menos que sus puntos
    const packed = new Array(16).fill(0), plain = new Array(16).fill(0);
    for (const [c, r] of runs) { packed[c] += 2; plain[c] += r + 1; }
    mask = 0;
    for (let c = 0; c < 16; c++) if (packed[c] < plain[c]) mask |= 1 << c;
  }
  const out = [];
  for (let n = 0; n < pixels.length;) {
    const c = pixels[n++];
    out.push(c);
    if (mask & (1 << c)) {
      let r = 0;
      while (n < pixels.length && pixels[n] === c && r < 15) { n++; r++; }
      out.push(r);
    }
  }
  return { mask, nib: out };
}

// Compresión de DMG para el ST y el Amiga: máscara (byte alto primero) y
// nibbles en palabras largas con el byte alto primero, el primer nibble en los
// bits bajos. null si no sale a cuenta
export function compress(pixels) {
  const { mask, nib } = nibbles(pixels);
  const words = Math.ceil(nib.length / 8);
  const out = new Uint8Array(2 + 4 * words);
  out[0] = mask >> 8; out[1] = mask & 255;
  for (let w = 0; w < words; w++) {
    let v = 0;
    for (let k = 7; k >= 0; k--) v = (v * 16) + (nib[w * 8 + k] ?? 0);
    out[2 + 4 * w] = (v >>> 24) & 255; out[3 + 4 * w] = (v >>> 16) & 255; out[4 + 4 * w] = (v >>> 8) & 255; out[5 + 4 * w] = v & 255;
  }
  return out.length < (pixels.length >> 1) ? out : null;
}

// Para el PC: los nibbles van de dos en dos en cada byte, el primero en los
// bits bajos. Con compressed, delante la máscara (byte bajo primero). El PC no
// tiene formato en planos: sin comprimir son los mismos nibbles, sin máscara.
export function compressPC(pixels, compressed = true) {
  const { mask, nib } = nibbles(pixels, compressed ? null : 0);
  const head = compressed ? 2 : 0;
  const out = new Uint8Array(head + Math.ceil(nib.length / 2));
  if (compressed) { out[0] = mask & 255; out[1] = mask >> 8; }
  for (let i = 0; i < nib.length; i++) out[head + (i >> 1)] |= nib[i] << (i & 1 ? 4 : 0);
  return out;
}

// Para las pruebas: vuelve a sacar los puntos de unos datos comprimidos
// (pc: los del formato del PC; mask = null si llevan la máscara delante)
export function decompress(data, count, { pc = false, mask = null } = {}) {
  let i0 = 2;
  if (mask === null) mask = pc ? data[0] | (data[1] << 8) : (data[0] << 8) | data[1];
  else i0 = 0;
  const nib = [];
  if (pc) for (let i = i0; i < data.length; i++) nib.push(data[i] & 15, data[i] >> 4);
  else {
    for (let i = i0; i + 3 < data.length; i += 4) {
      const v = ((data[i] << 24) | (data[i + 1] << 16) | (data[i + 2] << 8) | data[i + 3]) >>> 0;
      for (let k = 0; k < 8; k++) nib.push((v >>> (4 * k)) & 15);
    }
  }
  const out = [];
  for (let i = 0; out.length < count && i < nib.length;) {
    const c = nib[i++];
    out.push(c);
    if (mask & (1 << c)) for (let r = nib[i++]; r > 0; r--) out.push(c);
  }
  return Uint8Array.from(out.slice(0, count));
}

// images: [{ n, x, y, width, height, pixels, palette (16 colores 0RGB) }]
// pc: el formato del PC (todo con el byte bajo primero, firma FFFFh, datos
// siempre en nibbles y sin relleno: el intérprete salta de imagen en imagen
// sumando los tamaños)
export function buildDAT(images, { compressed = true, pc = false } = {}) {
  const parts = [];
  let size = HEADER + 256 * ENTRY;
  const offs = new Map();
  for (const im of images) {
    let data, z;
    if (pc) {
      const c = compressPC(im.pixels, true), u = compressPC(im.pixels, false);
      z = compressed && c.length < u.length;
      data = z ? c : u;
    } else {
      const c = compressed ? compress(im.pixels) : null;
      z = !!c;
      data = c ?? planar(im.pixels, im.width, im.height);
    }
    if (data.length > 0xffff) throw new Error('imagen demasiado grande');
    const block = new Uint8Array(6 + data.length + (pc ? 0 : data.length & 1));
    const w = im.width | (z ? 0x8000 : 0);
    const head = [w, im.height, data.length];
    head.forEach((v, k) => { block[2 * k] = pc ? v & 255 : v >> 8; block[2 * k + 1] = pc ? v >> 8 : v & 255; });
    block.set(data, 6);
    offs.set(im.n, size);
    parts.push(block);
    size += block.length;
  }
  const out = new Uint8Array(size);
  const dv = new DataView(out.buffer);
  const le = pc;
  dv.setUint16(0, pc ? 0xffff : 0x0300, le); dv.setUint16(2, 0, le); dv.setUint16(4, images.length, le); dv.setUint32(6, size, le);
  const byN = new Map(images.map((im) => [im.n, im]));
  for (let n = 0; n < 256; n++) {
    const e = HEADER + n * ENTRY, im = byN.get(n);
    dv.setUint32(e, im ? offs.get(n) : 0, le);
    dv.setUint16(e + 4, 4, le);
    dv.setUint16(e + 6, im ? im.x : 0, le); dv.setUint16(e + 8, im ? im.y : 0, le);
    out[e + 10] = 0; out[e + 11] = 15;
    const pal = im ? im.palette : DEFAULT_PALETTE;
    // la paleta, también en el PC, con el byte alto primero
    for (let k = 0; k < 16; k++) dv.setUint16(e + 12 + 2 * k, pal[k] ?? 0);
    if (!im && !pc) out.set(DEFAULT_TAIL, e + 44);
  }
  let o = HEADER + 256 * ENTRY;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

// Lee un .DAT (para las pruebas): [{ n, x, y, width, height, pixels, palette }].
// El del PC se reconoce por la firma FFFFh.
export function readDAT(d) {
  const dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
  const pc = dv.getUint16(0) === 0xffff, le = pc;
  const out = [];
  for (let n = 0; n < 256; n++) {
    const e = HEADER + n * ENTRY, off = dv.getUint32(e, le);
    if (!off) continue;
    const w = dv.getUint16(off, le), height = dv.getUint16(off + 2, le), len = dv.getUint16(off + 4, le);
    const width = w & 0x7fff, data = d.subarray(off + 6, off + 6 + len);
    let pixels;
    if (pc) pixels = decompress(data, width * height, { pc: true, mask: w & 0x8000 ? null : 0 });
    else if (w & 0x8000) pixels = decompress(data, width * height);
    else {
      pixels = new Uint8Array(width * height);
      const cols = width >> 3;
      for (let y = 0; y < height; y++) for (let c = 0; c < cols; c++) for (let p = 0; p < 4; p++) {
        const b = data[(y * cols + c) * 4 + p];
        for (let k = 0; k < 8; k++) if (b & (0x80 >> k)) pixels[y * width + c * 8 + k] |= 1 << p;
      }
    }
    const palette = Array.from({ length: 16 }, (_, k) => dv.getUint16(e + 12 + 2 * k));
    out.push({ n, x: dv.getUint16(e + 6, le), y: dv.getUint16(e + 8, le), width, height, pixels, palette, compressed: !!(w & 0x8000) });
  }
  return out;
}
