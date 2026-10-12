// PNG de paleta (8 bits por punto), para guardar como maestra las imágenes de
// 16 colores que se importan de los juegos de 16 bits. Comprime con
// CompressionStream, que tienen los navegadores y Node, así que es asíncrono.
//
//   encodePNG(ancho, alto, índices, paleta [[r, g, b], ...]) -> data: URL
//   decodePNG(data: URL) -> { width, height, rgba }   (solo los PNG de aquí:
//     de paleta o RGBA, 8 bits, sin entrelazar; lo usan las pruebas)

const SIG = [137, 80, 78, 71, 13, 10, 26, 10];

let crcTable = null;
function crc32(bytes) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (const b of bytes) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function pipe(bytes, stream) {
  const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

const be32 = (v) => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
function chunk(type, data) {
  const t = [...type].map((c) => c.charCodeAt(0));
  const body = Uint8Array.from([...t, ...data]);
  return [...be32(data.length), ...body, ...be32(crc32(body))];
}

export async function encodePNG(width, height, indices, palette) {
  // cada fila empieza con el filtro 0 (ninguno)
  const raw = new Uint8Array((width + 1) * height);
  for (let y = 0; y < height; y++) raw.set(indices.subarray(y * width, (y + 1) * width), y * (width + 1) + 1);
  const z = await pipe(raw, new CompressionStream('deflate'));
  const bytes = Uint8Array.from([
    ...SIG,
    ...chunk('IHDR', [...be32(width), ...be32(height), 8, 3, 0, 0, 0]),
    ...chunk('PLTE', palette.flat().map((v) => Math.round(v))),
    ...chunk('IDAT', z),
    ...chunk('IEND', []),
  ]);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return 'data:image/png;base64,' + btoa(s);
}

export async function decodePNG(url) {
  const b = Uint8Array.from(atob(url.slice(url.indexOf(',') + 1)), (c) => c.charCodeAt(0));
  const u32 = (o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
  let width = 0, height = 0, type = 0, palette = [];
  const idat = [];
  for (let o = 8; o < b.length;) {
    const len = u32(o), t = String.fromCharCode(...b.subarray(o + 4, o + 8)), d = b.subarray(o + 8, o + 8 + len);
    if (t === 'IHDR') { width = u32(o + 8); height = u32(o + 12); type = d[9]; }
    else if (t === 'PLTE') palette = Array.from({ length: len / 3 }, (_, i) => [d[3 * i], d[3 * i + 1], d[3 * i + 2]]);
    else if (t === 'IDAT') idat.push(d);
    o += 12 + len;
  }
  const raw = await pipe(Uint8Array.from(idat.flatMap((x) => [...x])), new DecompressionStream('deflate'));
  const bpp = type === 3 ? 1 : 4, stride = width * bpp;
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    if (raw[y * (stride + 1)] !== 0) throw new Error('PNG con filtro: no soportado');
    const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < width; x++) {
      const c = type === 3 ? [...palette[row[x]], 255] : row.subarray(x * 4, x * 4 + 4);
      rgba.set(c, (y * width + x) * 4);
    }
  }
  return { width, height, rgba };
}
