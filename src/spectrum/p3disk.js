// Lectura de discos de Spectrum +3 (.dsk, normal o extendido) para importar
// juegos.
//
// Si el disco tiene el formato de +3DOS (sectores 1-9 de 512 bytes, el
// directorio de CP/M tras las pistas reservadas), cada fichero de código
// (cabecera PLUS3DOS de tipo 3) se coloca en su dirección de carga: una
// imagen de la memoria por fichero, con los demás que no se solapan con él
// (los gráficos pueden ir en otro fichero). Si no (discos
// con cargador propio), se devuelve el contenido de las pistas tal cual, en
// orden; quien lo use tendrá que buscar en él.
// Devuelve [{ label, ram, raw? }].
import { t } from '../i18n.js';

export function readDisk(bytes) {
  const tracks = dskTracks(bytes);
  const images = [];
  const files = p3Files(tracks);
  const code = files.filter((f) => f.type === 3 && f.len > 0);
  const end = (f) => Math.min(0x10000, f.start + f.len);
  for (const f of code) {
    const ram = new Uint8Array(65536);
    for (const o of code) {
      if (o !== f && (o.start < end(f) && end(o) > f.start)) continue;
      ram.set(o.data.subarray(0, end(o) - o.start), o.start);
    }
    ram.set(f.data.subarray(0, end(f) - f.start), f.start);
    images.push({ label: f.name, ram });
  }
  // En bruto: todos los sectores, pista a pista y por número de sector
  const parts = [];
  for (const tr of tracks) for (const id of Object.keys(tr).map(Number).sort((a, b) => a - b)) parts.push(tr[id]);
  const raw = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let o = 0;
  for (const p of parts) { raw.set(p, o); o += p.length; }
  images.push({ label: '', ram: raw, raw: true });
  return images;
}

// Pistas del .dsk: [{ id del sector: datos }] en el orden de la imagen
function dskTracks(d) {
  const sig = String.fromCharCode(...d.subarray(0, 8));
  const ext = sig === 'EXTENDED';
  if (!ext && sig !== 'MV - CPC') throw new Error(t('Ese fichero no es una imagen de disco .dsk.'));
  const nTracks = d[0x30], nSides = d[0x31];
  const tracks = [];
  let off = 0x100;
  for (let k = 0; k < nTracks * nSides; k++) {
    const size = ext ? d[0x34 + k] * 256 : d[0x32] | (d[0x33] << 8);
    if (!size) { tracks.push({}); continue; }
    if (off + 0x100 > d.length || String.fromCharCode(...d.subarray(off, off + 10)) !== 'Track-Info') break;
    const n = d[off + 0x15], ssz = 128 << d[off + 0x14];
    const secs = {};
    let p = off + 0x100;
    for (let s = 0; s < n; s++) {
      const e = off + 0x18 + 8 * s;
      const len = ext ? d[e + 6] | (d[e + 7] << 8) : 128 << d[e + 3];
      secs[d[e + 2]] = d.subarray(p, p + Math.min(len, ssz * 8));
      p += len;
    }
    tracks.push(secs);
    off += size;
  }
  return tracks;
}

// Ficheros de +3DOS: [{ name, type, start, len, data }] (data sin la cabecera)
function p3Files(tracks) {
  const t0 = tracks[0];
  if (!t0 || !t0[1] || t0[1].length !== 512) return [];
  // especificación del disco en el sector 1 de la pista 0 (o la de siempre)
  const spec = t0[1];
  const ok = spec[0] === 0 || spec[0] === 3;
  const reserved = ok && spec[5] ? spec[5] : 1, bsh = ok && spec[6] ? spec[6] : 3, dirBlocks = ok && spec[7] ? spec[7] : 2;
  const spt = ok && spec[3] ? spec[3] : 9;
  const bs = 128 << bsh;
  const sector = (n) => {
    const tr = tracks[reserved + Math.floor(n / spt)];
    return tr && tr[1 + (n % spt)];
  };
  const block = (b) => {
    const out = new Uint8Array(bs);
    for (let k = 0; k < bs / 512; k++) {
      const s = sector(b * (bs / 512) + k);
      if (!s || s.length !== 512) return null;
      out.set(s, k * 512);
    }
    return out;
  };
  const dir = [];
  for (let b = 0; b < dirBlocks; b++) { const x = block(b); if (!x) return []; dir.push(x); }
  const entries = new Map();
  const big = (tracks.length - reserved) * spt * 512 / bs > 255;
  for (const x of dir) {
    for (let i = 0; i < x.length; i += 32) {
      const e = x.subarray(i, i + 32);
      if (e[0] > 15) continue;
      const name = String.fromCharCode(...e.subarray(1, 9)).trimEnd() + '.' + String.fromCharCode(...Array.from(e.subarray(9, 12), (c) => c & 0x7f)).trimEnd();
      if (/[^\x20-\x7e]/.test(name)) return [];        // no es un directorio
      const ex = e[12] | (e[14] << 5);
      const blocks = [];
      if (big) for (let k = 16; k < 32; k += 2) { const v = e[k] | (e[k + 1] << 8); if (v) blocks.push(v); }
      else for (let k = 16; k < 32; k++) if (e[k]) blocks.push(e[k]);
      const key = e[0] + ':' + name;
      if (!entries.has(key)) entries.set(key, { name, exts: [] });
      entries.get(key).exts.push({ ex, rc: e[15], blocks });
    }
  }
  const out = [];
  for (const { name, exts } of entries.values()) {
    exts.sort((a, b) => a.ex - b.ex);
    const chunks = [];
    for (const x of exts) for (const b of x.blocks) { const d = block(b); if (!d) return []; chunks.push(d); }
    const data = new Uint8Array(chunks.length * bs);
    chunks.forEach((c, k) => data.set(c, k * bs));
    if (String.fromCharCode(...data.subarray(0, 8)) !== 'PLUS3DOS') continue;
    const h = data.subarray(0, 128);
    out.push({ name, type: h[15], len: h[16] | (h[17] << 8), start: h[18] | (h[19] << 8), data: data.subarray(128) });
  }
  return out;
}
