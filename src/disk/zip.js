// Ficheros .zip. Se escriben sin comprimir (método 0, "store"): lo justo para
// entregar varios ficheros juntos. Cabecera local de cada fichero con sus
// datos, directorio central y registro final, todo con el byte bajo primero.
// Para importar se lee cualquier .zip normal (unzip, al final).
import { t } from '../i18n.js';

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
export function crc32(data) {
  let c = 0xffffffff;
  for (const b of data) c = CRC[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// files: [{ name: 'CARPETA/FICHERO.EXT', data }]
export function writeZip(files) {
  // fecha fija (1 de enero de 1990, 12:00) para que el mismo juego dé el
  // mismo fichero
  const time = 12 << 11, date = ((1990 - 1980) << 9) | (1 << 5) | 1;
  const enc = new TextEncoder();
  const entries = files.map((f) => ({ name: enc.encode(f.name), data: f.data, crc: crc32(f.data) }));
  const size = entries.reduce((a, e) => a + 30 + e.name.length + e.data.length + 46 + e.name.length, 22);
  const out = new Uint8Array(size);
  const dv = new DataView(out.buffer);
  let o = 0;
  const common = (e) => {
    dv.setUint16(o, 10, true); dv.setUint16(o + 2, 0x0800, true);  // versión 1.0, nombres en UTF-8
    dv.setUint16(o + 4, 0, true); dv.setUint16(o + 6, time, true); dv.setUint16(o + 8, date, true);
    dv.setUint32(o + 10, e.crc, true); dv.setUint32(o + 14, e.data.length, true); dv.setUint32(o + 18, e.data.length, true);
    dv.setUint16(o + 22, e.name.length, true); dv.setUint16(o + 24, 0, true);
  };
  for (const e of entries) {
    e.offset = o;
    dv.setUint32(o, 0x04034b50, true); o += 4;
    common(e); o += 26;
    out.set(e.name, o); o += e.name.length;
    out.set(e.data, o); o += e.data.length;
  }
  const dir = o;
  for (const e of entries) {
    dv.setUint32(o, 0x02014b50, true); dv.setUint16(o + 4, 20, true); o += 6;
    common(e); o += 26;
    dv.setUint16(o, 0, true); dv.setUint16(o + 2, 0, true); dv.setUint16(o + 4, 0, true);
    dv.setUint32(o + 6, 0, true); dv.setUint32(o + 10, e.offset, true); o += 14;
    out.set(e.name, o); o += e.name.length;
  }
  dv.setUint32(o, 0x06054b50, true);
  dv.setUint16(o + 8, entries.length, true); dv.setUint16(o + 10, entries.length, true);
  dv.setUint32(o + 12, o - dir, true); dv.setUint32(o + 16, dir, true);
  return out;
}

// Lee un .zip sin comprimir (para las pruebas): [{ name, data, crcOk }]
export function readZip(z) {
  const dv = new DataView(z.buffer, z.byteOffset, z.byteLength);
  const out = [];
  for (let o = 0; dv.getUint32(o, true) === 0x04034b50;) {
    const crc = dv.getUint32(o + 14, true), len = dv.getUint32(o + 18, true), nl = dv.getUint16(o + 26, true), xl = dv.getUint16(o + 28, true);
    const name = new TextDecoder().decode(z.subarray(o + 30, o + 30 + nl));
    const data = z.subarray(o + 30 + nl + xl, o + 30 + nl + xl + len);
    out.push({ name, data, crcOk: crc32(data) === crc });
    o += 30 + nl + xl + len;
  }
  return out;
}

// Lee cualquier .zip normal (guardado o comprimido con deflate) desde el
// directorio central: [{ name, data }]. Asíncrono: descomprime con
// DecompressionStream.
export async function unzip(z) {
  const dv = new DataView(z.buffer, z.byteOffset, z.byteLength);
  let end = -1;
  for (let o = z.length - 22; o >= Math.max(0, z.length - 0x10000 - 22); o--) if (dv.getUint32(o, true) === 0x06054b50) { end = o; break; }
  if (end < 0) throw new Error(t('Ese fichero no es un .zip.'));
  const n = dv.getUint16(end + 10, true);
  const out = [];
  for (let i = 0, o = dv.getUint32(end + 16, true); i < n; i++) {
    if (dv.getUint32(o, true) !== 0x02014b50) break;
    const method = dv.getUint16(o + 10, true), size = dv.getUint32(o + 20, true);
    const nl = dv.getUint16(o + 28, true), xl = dv.getUint16(o + 30, true), cl = dv.getUint16(o + 32, true);
    const local = dv.getUint32(o + 42, true);
    const name = new TextDecoder().decode(z.subarray(o + 46, o + 46 + nl));
    o += 46 + nl + xl + cl;
    if (name.endsWith('/')) continue;
    const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
    const raw = z.subarray(start, start + size);
    let data;
    if (method === 0) data = raw.slice();
    else if (method === 8) {
      const res = new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw')));
      data = new Uint8Array(await res.arrayBuffer());
    } else continue;
    out.push({ name, data });
  }
  return out;
}
