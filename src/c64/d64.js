// Discos .d64 de la unidad 1541 (Commodore 64 y Plus/4): 35 pistas, 683
// sectores de 256 bytes. La BAM y el directorio van en la pista 18. Cada
// sector de un fichero empieza por la pista y el sector del siguiente (en el
// último, 0 y el último byte usado) y lleva 254 bytes de datos.

const SPT = (t) => (t <= 17 ? 21 : t <= 24 ? 19 : t <= 30 ? 18 : 17);    // sectores por pista
const TRACKS = 35, DIR_TRACK = 18;
const offset = (t, s) => { let o = 0; for (let k = 1; k < t; k++) o += SPT(k); return (o + s) * 256; };
export const D64_SIZE = offset(TRACKS + 1, 0);           // 174848

// Texto a PETSCII para nombres: mayúsculas ASCII, el resto fuera
const petscii = (s) => Array.from(s.normalize('NFD').replace(/[^\x20-\x7e]/g, '').toUpperCase(), (c) => c.charCodeAt(0));
const padded = (s, n) => { const b = petscii(s).slice(0, n); while (b.length < n) b.push(0xa0); return b; };

// files: [{ name, data (con la dirección de carga delante, como un .prg) }]
export function writeD64(files, { title = 'DAAD', id = 'RO' } = {}) {
  const img = new Uint8Array(D64_SIZE);
  const used = new Set();
  const take = (t, s) => used.add(t * 32 + s);
  const isUsed = (t, s) => used.has(t * 32 + s);
  take(DIR_TRACK, 0);
  // sectores libres en el orden de la 1541: pistas cerca del directorio
  // primero, con un salto de 10 sectores entre uno y el siguiente
  const order = [];
  for (let d = 1; d < TRACKS; d++) for (const t of [DIR_TRACK - d, DIR_TRACK + d]) if (t >= 1 && t <= TRACKS) order.push(t);
  let ti = 0, last = { t: order[0], s: 0 };
  const alloc = () => {
    for (; ti < order.length; ti++) {
      const t = order[ti], n = SPT(t);
      const start = t === last.t ? (last.s + 10) % n : 0;
      for (let k = 0; k < n; k++) {
        const s = (start + k) % n;
        if (!isUsed(t, s)) { take(t, s); last = { t, s }; return [t, s]; }
      }
    }
    throw new Error('disk-full');
  };
  const entries = [];
  for (const f of files) {
    const chunks = Math.max(1, Math.ceil(f.data.length / 254));
    const secs = Array.from({ length: chunks }, alloc);
    secs.forEach(([t, s], i) => {
      const o = offset(t, s);
      const part = f.data.subarray(i * 254, i * 254 + 254);
      if (i < chunks - 1) { img[o] = secs[i + 1][0]; img[o + 1] = secs[i + 1][1]; } else { img[o] = 0; img[o + 1] = part.length + 1; }
      img.set(part, o + 2);
    });
    entries.push({ name: f.name, first: secs[0], blocks: chunks });
  }
  // directorio: sectores 1, 4, 7... de la pista 18, 8 entradas en cada uno
  const dirSecs = [];
  for (let k = 0; k * 8 < Math.max(1, entries.length); k++) { const s = 1 + 3 * k; take(DIR_TRACK, s); dirSecs.push(s); }
  dirSecs.forEach((s, k) => {
    const o = offset(DIR_TRACK, s);
    if (k < dirSecs.length - 1) { img[o] = DIR_TRACK; img[o + 1] = dirSecs[k + 1]; } else { img[o] = 0; img[o + 1] = 0xff; }
    entries.slice(k * 8, k * 8 + 8).forEach((e, j) => {
      const p = o + 32 * j;
      img[p + 2] = 0x82;                                   // PRG, cerrado
      img[p + 3] = e.first[0]; img[p + 4] = e.first[1];
      img.set(padded(e.name, 16), p + 5);
      img[p + 30] = e.blocks & 255; img[p + 31] = e.blocks >> 8;
    });
  });
  // BAM
  const b = offset(DIR_TRACK, 0);
  img[b] = DIR_TRACK; img[b + 1] = 1; img[b + 2] = 0x41;
  for (let t = 1; t <= TRACKS; t++) {
    const n = SPT(t);
    let free = 0, bits = 0;
    for (let s = 0; s < n; s++) if (!isUsed(t, s)) { free++; bits |= 1 << s; }
    img[b + 4 * t] = free;
    img[b + 4 * t + 1] = bits & 255; img[b + 4 * t + 2] = (bits >> 8) & 255; img[b + 4 * t + 3] = bits >> 16;
  }
  img.set(padded(title, 16), b + 0x90);
  img[b + 0xa0] = 0xa0; img[b + 0xa1] = 0xa0;
  img.set(padded(id, 2), b + 0xa2);
  img[b + 0xa4] = 0xa0; img[b + 0xa5] = 0x32; img[b + 0xa6] = 0x41;
  img.fill(0xa0, b + 0xa7, b + 0xab);
  return img;
}

// Bloques libres que quedan después de poner unos ficheros
export const d64Free = (img) => { let n = 0; for (let t = 1; t <= TRACKS; t++) if (t !== DIR_TRACK) n += img[offset(DIR_TRACK, 0) + 4 * t]; return n; };

// Lee los ficheros: [{ name, type, data }]
export function readD64(img) {
  const out = [];
  let t = DIR_TRACK, s = 1;
  const seen = new Set();
  while (t && !seen.has(t * 32 + s)) {
    seen.add(t * 32 + s);
    const o = offset(t, s);
    for (let j = 0; j < 8; j++) {
      const p = o + 32 * j;
      const type = img[p + 2];
      if (!(type & 0x80)) continue;
      let name = '';
      for (let k = 0; k < 16 && img[p + 5 + k] !== 0xa0; k++) name += String.fromCharCode(img[p + 5 + k]);
      const data = [];
      let ft = img[p + 3], fs = img[p + 4];
      const guard = new Set();
      while (ft && !guard.has(ft * 32 + fs)) {
        guard.add(ft * 32 + fs);
        const q = offset(ft, fs);
        const nt = img[q], ns = img[q + 1];
        data.push(...img.subarray(q + 2, nt ? q + 256 : q + ns + 1));
        ft = nt; fs = ns;
      }
      out.push({ name, type: type & 7, data: Uint8Array.from(data) });
    }
    t = img[o]; s = img[o + 1];
  }
  return out;
}
