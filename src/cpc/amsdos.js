// Ficheros y discos del Amstrad CPC: cabecera AMSDOS de 128 bytes y discos
// .dsk en formato DATA (40 pistas de 9 sectores de 512 bytes, C1h a C9h,
// bloques de 1K, directorio de 64 entradas en los dos primeros bloques).
// El .dsk es el formato estándar de los emuladores ("MV - CPCEMU").

// Cabecera AMSDOS. type: 0 BASIC, 2 binario.
export function amsdosHeader({ name, ext = 'BIN', type = 2, load = 0, exec = 0, length }) {
  const h = new Uint8Array(128);
  const put = (at, s, n) => { const t = s.toUpperCase().padEnd(n).slice(0, n); for (let i = 0; i < n; i++) h[at + i] = t.charCodeAt(i); };
  put(1, name, 8);
  put(9, ext, 3);
  h[18] = type;
  h[21] = load & 255; h[22] = load >> 8;
  h[23] = 0xff;
  h[24] = length & 255; h[25] = (length >> 8) & 255;
  h[26] = exec & 255; h[27] = exec >> 8;
  h[64] = length & 255; h[65] = (length >> 8) & 255; h[66] = length >> 16;
  let sum = 0;
  for (let i = 0; i < 67; i++) sum += h[i];
  h[67] = sum & 255; h[68] = (sum >> 8) & 255;
  return h;
}

// Fichero binario con su cabecera delante
export function amsdosFile(opts, data) {
  const out = new Uint8Array(128 + data.length);
  out.set(amsdosHeader({ ...opts, length: data.length }), 0);
  out.set(data, 128);
  return out;
}

// Lee la cabecera si es válida (la suma cuadra); si no, null
export function readHeader(f) {
  if (f.length < 128) return null;
  let sum = 0;
  for (let i = 0; i < 67; i++) sum += f[i];
  if ((sum & 0xffff) !== (f[67] | (f[68] << 8))) return null;
  if (f.subarray(0, 67).every((b) => b === 0)) return null;
  return { type: f[18], load: f[21] | (f[22] << 8), length: f[24] | (f[25] << 8), exec: f[26] | (f[27] << 8) };
}

const TRACKS = 40, SECTORS = 9, SECTOR = 512, TRACK_LEN = 0x100 + SECTORS * SECTOR;
const FIRST_ID = 0xc1, DIR_BLOCKS = 2, BLOCK = 1024;
const BLOCKS = (TRACKS * SECTORS * SECTOR) / BLOCK;          // 180

// Disco DATA con los ficheros dados: [{ name: 'DISC.BIN', data }]. data ya
// lleva la cabecera AMSDOS si el fichero la necesita.
export function dataDisk(files, creator = 'Rocinante') {
  const img = new Uint8Array(0x100 + TRACKS * TRACK_LEN);
  const sig = 'MV - CPCEMU Disk-File\r\nDisk-Info\r\n';
  for (let i = 0; i < sig.length; i++) img[i] = sig.charCodeAt(i);
  for (let i = 0; i < creator.length && i < 14; i++) img[0x22 + i] = creator.charCodeAt(i);
  img[0x30] = TRACKS; img[0x31] = 1;
  img[0x32] = TRACK_LEN & 255; img[0x33] = TRACK_LEN >> 8;
  for (let t = 0; t < TRACKS; t++) {
    const o = 0x100 + t * TRACK_LEN;
    const ti = 'Track-Info\r\n';
    for (let i = 0; i < ti.length; i++) img[o + i] = ti.charCodeAt(i);
    img[o + 0x10] = t; img[o + 0x11] = 0;
    img[o + 0x14] = 2; img[o + 0x15] = SECTORS; img[o + 0x16] = 0x4e; img[o + 0x17] = 0xe5;
    for (let s = 0; s < SECTORS; s++) {
      const si = o + 0x18 + 8 * s;
      img[si] = t; img[si + 1] = 0; img[si + 2] = FIRST_ID + s; img[si + 3] = 2;
    }
    img.fill(0xe5, o + 0x100, o + TRACK_LEN);
  }
  // sector lógico n (de 0 a 359) -> posición en la imagen
  const sec = (n) => 0x100 + Math.floor(n / SECTORS) * TRACK_LEN + 0x100 + (n % SECTORS) * SECTOR;
  const writeBlock = (b, bytes) => {
    for (let k = 0; k < 2; k++) {
      const part = bytes.subarray(k * SECTOR, (k + 1) * SECTOR);
      img.fill(0, sec(b * 2 + k), sec(b * 2 + k) + SECTOR);
      img.set(part, sec(b * 2 + k));
    }
  };
  const dir = new Uint8Array(DIR_BLOCKS * BLOCK).fill(0xe5);
  let nextBlock = DIR_BLOCKS, entry = 0;
  for (const f of files) {
    const [base, ext = ''] = f.name.toUpperCase().split('.');
    const nBlocks = Math.ceil(f.data.length / BLOCK);
    if (nextBlock + nBlocks > BLOCKS) throw new Error('disk-full');
    const records = Math.ceil(f.data.length / 128);
    for (let x = 0; x * 16 < Math.max(nBlocks, 1); x++) {
      if (entry >= 64) throw new Error('disk-full');
      const e = dir.subarray(entry * 32, entry * 32 + 32);
      e.fill(0);
      const nm = base.padEnd(8).slice(0, 8) + ext.padEnd(3).slice(0, 3);
      for (let i = 0; i < 11; i++) e[1 + i] = nm.charCodeAt(i);
      e[12] = x;
      e[15] = Math.min(0x80, records - x * 128);
      for (let k = 0; k < 16 && x * 16 + k < nBlocks; k++) e[16 + k] = nextBlock + x * 16 + k;
      entry++;
    }
    for (let k = 0; k < nBlocks; k++) {
      const chunk = new Uint8Array(BLOCK);
      chunk.set(f.data.subarray(k * BLOCK, (k + 1) * BLOCK));
      writeBlock(nextBlock + k, chunk);
    }
    nextBlock += nBlocks;
  }
  writeBlock(0, dir.subarray(0, BLOCK));
  writeBlock(1, dir.subarray(BLOCK));
  return img;
}

// Espacio libre en un disco DATA, en bytes, para unos ficheros dados
export const diskCapacity = () => (BLOCKS - DIR_BLOCKS) * BLOCK;

// Lee los ficheros de un .dsk (estándar o extendido; formato DATA o SYSTEM).
// Devuelve [{ name, data }] con los datos tal cual (con su cabecera AMSDOS).
export function readDisk(d) {
  const ext = String.fromCharCode(...d.subarray(0, 8)) === 'EXTENDED';
  const nt = d[0x30] * d[0x31];
  const tracks = new Map();
  let off = 0x100;
  for (let t = 0; t < nt; t++) {
    const size = ext ? d[0x34 + t] * 256 : d[0x32] | (d[0x33] << 8);
    if (!size) continue;
    const ti = d.subarray(off, off + 0x100);
    const n = ti[0x15], secs = new Map();
    let p = off + 0x100;
    for (let s = 0; s < n; s++) {
      const id = ti[0x18 + 8 * s + 2];
      const len = ext ? ti[0x18 + 8 * s + 6] | (ti[0x18 + 8 * s + 7] << 8) : 128 << ti[0x14];
      secs.set(id, d.subarray(p, p + len));
      p += len;
    }
    tracks.set(ti[0x10], secs);
    off += size;
  }
  const t0 = tracks.get(0);
  if (!t0) return [];
  const first = Math.min(...t0.keys());
  const reserved = first === 0x41 ? 2 : 0;                 // SYSTEM: dos pistas reservadas
  const ids = [...tracks.get(reserved).keys()].sort((a, b) => a - b);
  const block = (b) => {
    const out = new Uint8Array(BLOCK);
    for (let k = 0; k < 2; k++) {
      const ls = b * 2 + k;
      const s = tracks.get(reserved + Math.floor(ls / SECTORS))?.get(ids[ls % SECTORS]);
      if (s) out.set(s.subarray(0, SECTOR), k * SECTOR);
    }
    return out;
  };
  const dir = new Uint8Array(DIR_BLOCKS * BLOCK);
  dir.set(block(0), 0); dir.set(block(1), BLOCK);
  const files = new Map();
  for (let e = 0; e < 64; e++) {
    const en = dir.subarray(e * 32, e * 32 + 32);
    if (en[0] === 0xe5 || en[0] > 15) continue;
    const name = String.fromCharCode(...en.subarray(1, 9)).trim() + '.' + String.fromCharCode(...Array.from(en.subarray(9, 12), (c) => c & 0x7f)).trim();
    if (!files.has(name)) files.set(name, []);
    files.get(name).push({ x: en[12], rc: en[15], blocks: [...en.subarray(16, 32)].filter(Boolean) });
  }
  return [...files].map(([name, parts]) => {
    parts.sort((a, b) => a.x - b.x);
    const len = parts.reduce((a, p) => a + p.rc * 128, 0);
    const data = new Uint8Array(parts.reduce((a, p) => a + p.blocks.length, 0) * BLOCK);
    let at = 0;
    for (const p of parts) for (const b of p.blocks) { data.set(block(b), at); at += BLOCK; }
    return { name, data: data.subarray(0, len) };
  });
}
