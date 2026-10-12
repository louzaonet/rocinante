// Juegos de DAAD de Amstrad CPC (disco .dsk de AMSDOS o cinta .cdt) y de
// Commodore 64 (disco .d64 o un .prg): cada fichero de código va a su
// dirección de carga, y en esa memoria se busca la base de datos (en 2880h en
// el CPC, en 3880h en el C64). De momento se importa la base de datos; los
// dibujos de estas máquinas, no.

import { readDisk as readAmsdos, readHeader } from '../cpc/amsdos.js';
import { tapeBlocks } from '../spectrum/tapread.js';
import { readD64 } from '../c64/d64.js';

// ¿Es un disco de CPC? (sectores C1h-C9h, DATA, o 41h-49h, SYSTEM)
export function isCpcDisk(d) {
  if (!/^(EXTENDED CPC DSK|MV - CPC)/.test(String.fromCharCode(...d.subarray(0, 16)))) return false;
  const id = d[0x100 + 0x18 + 2];
  return (id & 0x3f) >= 1 && (id & 0x3f) <= 9 && (id & 0xc0) !== 0 && String.fromCharCode(...d.subarray(0x100, 0x10a)) === 'Track-Info';
}

// Ficheros del disco con cabecera AMSDOS: [{ name, load, data }]
export function cpcDiskFiles(d) {
  return readAmsdos(d).map((f) => {
    const h = readHeader(f.data);
    return h ? { name: f.name, load: h.load, data: f.data.subarray(128, 128 + h.length) } : null;
  }).filter(Boolean);
}

// ¿Es una cinta de CPC? (un .cdt: TZX con registros del firmware del CPC)
export function isCpcTape(t, name = '') {
  if (String.fromCharCode(...t.subarray(0, 7)) !== 'ZXTape!') return false;
  if (/\.cdt$/i.test(name)) return true;
  const b = tapeBlocks(t);
  return b.length > 1 && b[0].flag === 0x2c;
}

// Ficheros de la cinta: cada uno, en bloques de 2K con su registro de
// cabecera (2Ch) y de datos (16h) por segmentos de 256 bytes con su CRC.
// Devuelve { files: [{ name, load, data }], unplaced } (unplaced: registros
// que no son del firmware: un cargador propio)
export function cpcTapeFiles(t) {
  const files = new Map();
  let unplaced = 0, head = null;
  const seg = (d, k) => d.subarray(k * 258, k * 258 + 256);
  for (const b of tapeBlocks(t)) {
    if (b.flag === 0x2c && b.data.length >= 256) {
      const h = seg(b.data, 0);
      head = {
        name: String.fromCharCode(...h.subarray(0, 16)).replace(/\0+$/, '').trim(), block: h[16], length: h[19] | (h[20] << 8),
        load: h[21] | (h[22] << 8), first: h[23] !== 0, total: h[24] | (h[25] << 8),
      };
    } else if (b.flag === 0x16 && head) {
      const data = new Uint8Array(head.length);
      for (let k = 0; k * 256 < head.length; k++) data.set(seg(b.data, k).subarray(0, Math.min(256, head.length - k * 256)), k * 256);
      if (head.first || !files.has(head.name)) files.set(head.name, { name: head.name, load: head.load, parts: [] });
      files.get(head.name).parts.push(data);
      head = null;
    } else unplaced++;
  }
  return {
    files: [...files.values()].map((f) => {
      const data = new Uint8Array(f.parts.reduce((a, p) => a + p.length, 0));
      let o = 0;
      for (const p of f.parts) { data.set(p, o); o += p.length; }
      return { name: f.name, load: f.load, data };
    }),
    unplaced,
  };
}

// Ficheros PRG de un .d64 (o un .prg suelto): los dos primeros bytes son la
// dirección de carga
export function c64Files(bytes, name = '') {
  const list = /\.prg$/i.test(name) ? [{ name, type: 2, data: bytes }] : readD64(bytes);
  return list.filter((f) => f.type === 2 && f.data.length > 2).map((f) => ({ name: f.name, load: f.data[0] | (f.data[1] << 8), data: f.data.subarray(2) }));
}
export const isD64 = (b, name = '') => /\.d64$/i.test(name) || b.length === 174848 || b.length === 175531;

// Todos los ficheros en una memoria de 64K
export function placeFiles(files) {
  const ram = new Uint8Array(65536);
  for (const f of files) ram.set(f.data.subarray(0, Math.max(0, 0x10000 - f.load)), f.load);
  return ram;
}
